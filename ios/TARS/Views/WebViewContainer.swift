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
        
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences
        
        let userContentController = WKUserContentController()
        
        let secret = config.bootstrapSecret.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
        let injectionJS = """
        (function() {
            window.__TARS_NATIVE__ = true;
            window.__TARS_VERSION__ = '1.0.0';
            window.__TARS_BOOTSTRAP_SECRET__ = '(secret)';
            
            // 1. 强制铺满全屏视口，禁用误触缩放，修复渲染比例
            function applyViewport() {
                let meta = document.querySelector('meta[name="viewport"]');
                const desired = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.name = 'viewport';
                    document.head.appendChild(meta);
                }
                meta.setAttribute('content', desired);
                
                // 注入禁止 iOS Safari 键盘弹出自动放大页面样式的 CSS (input font-size 强制 >= 16px)
                let style = document.getElementById('tars-ios-style');
                if (!style) {
                    style = document.createElement('style');
                    style.id = 'tars-ios-style';
                    style.innerHTML = 'html, body, #root { width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; -webkit-text-size-adjust: 100% !important; } input, select, textarea { font-size: 16px !important; } * { -webkit-tap-highlight-color: transparent; }';
                    document.head.appendChild(style);
                }
            }
            applyViewport();
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', applyViewport);
            }
            
            // 2. 注入 localStorage 凭据
            const secret = '(secret)';
            if (secret && secret.length > 0) {
                try {
                    window.localStorage.setItem('nanobot-webui.bootstrap-secret', secret);
                } catch(e) {}
            }
            
            // 3. 原生触觉反馈
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
        userContentController.add(context.coordinator, name: "tarsHaptic")
        configuration.userContentController = userContentController
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = true
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
                DispatchQueue.main.async {
                    self.parent.loadError = URLError(.badURL)
                }
                return
            }
            
            var request = URLRequest(url: url)
            request.timeoutInterval = 30
            request.cachePolicy = .useProtocolCachePolicy
            
            if !parent.config.bootstrapSecret.isEmpty {
                request.setValue("Bearer \(parent.config.bootstrapSecret)", forHTTPHeaderField: "Authorization")
                request.setValue(parent.config.bootstrapSecret, forHTTPHeaderField: "X-Nanobot-Auth")
            }
            
            DispatchQueue.main.async {
                self.parent.isLoading = true
                self.parent.loadError = nil
            }
            webView.load(request)
        }
        
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
            
            // 页面加载完成后，确保 localStorage 正确写入并尝试一次静默解除登录表单
            let secret = parent.config.bootstrapSecret.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
            let finishScript = """
            (function() {
                const secret = '(secret)';
                if (!secret) return;
                try {
                    window.localStorage.setItem('nanobot-webui.bootstrap-secret', secret);
                } catch(e) {}
                
                // 如果页面当前在密码输入界面，且尚未提交过
                const input = document.getElementById('webui-access-password');
                if (input && !input.disabled && !window.__TARS_AUTO_SUBMITTED__) {
                    window.__TARS_AUTO_SUBMITTED__ = true;
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                    if (setter) {
                        setter.call(input, secret);
                    } else {
                        input.value = secret;
                    }
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    setTimeout(function() {
                        const form = input.closest('form');
                        if (form) {
                            const btn = form.querySelector('button[type="submit"]');
                            if (btn && !btn.disabled) {
                                btn.click();
                            }
                        }
                    }, 50);
                }
            })();
            """
            webView.evaluateJavaScript(finishScript, completionHandler: nil)
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
                return
            }
            DispatchQueue.main.async {
                self.parent.isLoading = false
                self.parent.loadError = error
            }
        }
        
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

