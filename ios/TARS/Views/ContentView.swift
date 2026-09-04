import SwiftUI

extension NSNotification.Name {
    static let deviceDidShakeNotification = NSNotification.Name("deviceDidShakeNotification")
}

extension UIWindow {
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        super.motionEnded(motion, with: event)
        if motion == .motionShake {
            NotificationCenter.default.post(name: .deviceDidShakeNotification, object: nil)
        }
    }
}

public struct ContentView: View {
    @StateObject private var config = ServerConfig.shared
    @State private var isLoading: Bool = false
    @State private var loadError: Error? = nil
    @State private var reloadTrigger: UUID = UUID()
    @State private var showSettings: Bool = false
    
    public init() {}
    
    public var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()
            
            // 核心 WebUI 容器，真正铺满现代 iPhone 全屏幕
            WebViewContainer(
                config: config,
                isLoading: $isLoading,
                loadError: $loadError,
                reloadTrigger: $reloadTrigger
            )
            .ignoresSafeArea()
            
            // 顶部细条加载进度
            VStack {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(.linear)
                        .tint(.accentColor)
                        .transition(.opacity)
                }
                Spacer()
            }
            .ignoresSafeArea(.all, edges: .horizontal)
            
            // 离线/异常兜底卡片
            if let error = loadError {
                errorOverlay(error)
            }
            
            // 悬浮轻量快捷工具条 (右下角紧凑胶囊)
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    floatingToolbar
                        .padding(.trailing, 16)
                        .padding(.bottom, 24)
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet(config: config, reloadTrigger: $reloadTrigger)
        }
        .onReceive(NotificationCenter.default.publisher(for: .deviceDidShakeNotification)) { _ in
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            showSettings = true
        }
    }
    
    private var floatingToolbar: some View {
        HStack(spacing: 12) {
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                reloadTrigger = UUID()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)
                    .frame(width: 32, height: 32)
            }
            
            Divider()
                .frame(height: 16)
            
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                showSettings = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)
                    .frame(width: 32, height: 32)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(
            Capsule()
                .stroke(Color.primary.opacity(0.1), lineWidth: 0.5)
        )
        .shadow(color: Color.black.opacity(0.12), radius: 8, x: 0, y: 4)
    }
    
    private func errorOverlay(_ error: Error) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 48, weight: .light))
                .foregroundColor(.secondary)
            
            Text("无法连接到 TARS")
                .font(.headline)
            
            Text(error.localizedDescription)
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            
            HStack(spacing: 16) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    reloadTrigger = UUID()
                } label: {
                    Label("重试", systemImage: "arrow.clockwise")
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 8))
                        .foregroundColor(.white)
                }
                
                Button {
                    showSettings = true
                } label: {
                    Label("设置", systemImage: "gearshape")
                        .font(.subheadline)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding(.top, 8)
        }
        .padding(28)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color.black.opacity(0.15), radius: 16, x: 0, y: 6)
        .padding(24)
    }
}

