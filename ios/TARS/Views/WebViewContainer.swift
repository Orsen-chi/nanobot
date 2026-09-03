import SwiftUI
import WebKit

public struct WebViewContainer: UIViewRepresentable {
    @ObservedObject var config: ServerConfig
    @Binding var isLoading: Bool
    @Binding var loadError: Error?
    @Binding var reloadTrigger: UUID
    
    public init(
        config: ServerConfig,
        isLoading: Binding<Bool>,
        loadError: Binding<Error?>,
        reloadTrigger: Binding<UUID>
    ) {
        self.config = config
        self._isLoading = isLoading
        self._loadError = loadError
        self._reloadTrigger = reloadTrigger
    }
    
    public func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    public func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        
        // 允许跨域存储与 Cookie
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences
        
        // 注入客户端标识与鉴权脚本
        let userContentController = WKUserContentController()
        
        // 注入 TARS 宿主标记以及自动鉴权脚本
        let secret = config.bootstrapSecret.replacingOccurrences(of: "'", with: "\'")
        let injectionJS = """
        (function() {
            window.__TARS_NATIVE__ = true;
            window.__TARS_VERSION__ = '1.0.0';
            const secret = '(secret)';
            if (secret && secret.length > 0) {
                try {
                    window.localStorage.setItem('nanobot-webui.bootstrap-secret', secret);
                } catch(e) {}
            }
            // 提供原生振动反馈接口给 WebUI
            window.tarsHaptic = function(type) {
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tarsHaptic) {
                    window.webkit.messageHandlers.tarsHaptic.postMessage(type || 'medium');
                }
            };
        })();
        """
        let userScript = WKUserScript(
            source: injectionJS,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        userContentController.addUserScript(userScript)
        
        // 注册 Haptic 消息桥接
        userContentController.add(context.coordinator, name: "tarsHaptic")
        configuration.userContentController = userContentController
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        
        context.coordinator.webView = webView
        context.coordinator.loadTarget(in: webView)
        return webView
    }
    
    public func updateUIView(_ uiView: WKWebView, context: Context) {
        if context.coordinator.lastReloadTrigger != reloadTrigger {
            context.coordinator.lastReloadTrigger = reloadTrigger
            context.coordinator.loadTarget(in: uiView)
        }
    }
    
    public final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        var parent: WebViewContainer
        weak var webView: WKWebView?
        var lastReloadTrigger: UUID?
        
        init(_ parent: WebViewContainer) {
            self.parent = parent
            self.lastReloadTrigger = parent.reloadTrigger
        }
        
        func loadTarget(in webView: WKWebView) {
            guard let url = parent.config.targetURL else {
                parent.loadError = URLError(.badURL)
                return
            }
            
            var request = URLRequest(url: url)
            request.timeoutInterval = 30
            request.cachePolicy = .useProtocolCachePolicy
            
            // 如果配置了 secret，在初次请求头中附带
            if !parent.config.bootstrapSecret.isEmpty {
                request.setValue("Bearer (parent.config.bootstrapSecret)", forHTTPHeaderField: "Authorization")
                request.setValue(parent.config.bootstrapSecret, forHTTPHeaderField: "X-Nanobot-Auth")
            }
            
            parent.isLoading = true
            parent.loadError = nil
            webView.load(request)
        }
        
        // MARK: - WKNavigationDelegate
        
        public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.parent.isLoading = true
                self.parent.loadError = nil
            }
        }
        
        public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.parent.isLoading = false
                self.parent.loadError = nil
            }
        }
        
        public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handleError(error)
        }
        
        public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            handleError(error)
        }
        
        private func handleError(_ error: Error) {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
                // 用户中断或页面重定向，非致命错误
                return
            }
            DispatchQueue.main.async {
                self.parent.isLoading = false
                self.parent.loadError = error
            }
        }
        
        // MARK: - WKUIDelegate (麦克风/摄像头权限透传)
        
        @available(iOS 15.0, *)
        public func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            decisionHandler(.grant)
        }
        
        // MARK: - WKScriptMessageHandler
        
        public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "tarsHaptic", let type = message.body as? String else { return }
            DispatchQueue.main.async {
                switch type {
                case "light":
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                case "medium":
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                case "heavy":
                    UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                case "success":
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                case "warning":
                    UINotificationFeedbackGenerator().notificationOccurred(.warning)
                case "error":
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                default:
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                }
            }
        }
    }
}
