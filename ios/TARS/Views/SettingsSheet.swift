import SwiftUI
import WebKit

public struct SettingsSheet: View {
    @ObservedObject var config: ServerConfig
    @Binding var reloadTrigger: UUID
    @Environment(\.dismiss) private var dismiss
    
    @State private var inputURL: String = ""
    @State private var inputSecret: String = ""
    @State private var showSecret: Bool = false
    @State private var showClearConfirm: Bool = false
    @State private var clearStatusMessage: String? = nil
    
    public init(config: ServerConfig, reloadTrigger: Binding<UUID>) {
        self.config = config
        self._reloadTrigger = reloadTrigger
    }
    
    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Image(systemName: "server.rack")
                            .foregroundColor(.accentColor)
                            .frame(width: 24)
                        TextField("https://...", text: $inputURL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                    }
                    
                    if inputURL != ServerConfig.defaultServerURL {
                        Button("恢复默认地址") {
                            inputURL = ServerConfig.defaultServerURL
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }
                        .font(.footnote)
                    }
                } header: {
                    Text("NanoBot 服务端地址")
                } footer: {
                    Text("默认已配置为新加坡 Green Cloud VPS 的公网隧道。")
                }
                
                Section {
                    HStack {
                        Image(systemName: "key.fill")
                            .foregroundColor(.accentColor)
                            .frame(width: 24)
                        
                        if showSecret {
                            TextField("未设置则每次手动输入", text: $inputSecret)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled(true)
                        } else {
                            SecureField("未设置则每次手动输入", text: $inputSecret)
                        }
                        
                        Button {
                            showSecret.toggle()
                        } label: {
                            Image(systemName: showSecret ? "eye.slash" : "eye")
                                .foregroundColor(.secondary)
                        }
                        .buttonStyle(.borderless)
                    }
                } header: {
                    Text("访问密码 (Bootstrap Secret)")
                } footer: {
                    Text("填入后，App 将在连接时自动静默登录，无需手机端重复输入密码。")
                }
                
                Section {
                    Button(role: .destructive) {
                        showClearConfirm = true
                    } label: {
                        HStack {
                            Image(systemName: "trash")
                            Text("清除 WebView 缓存与存储")
                        }
                    }
                    
                    if let msg = clearStatusMessage {
                        Text(msg)
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                } header: {
                    Text("数据与重置")
                }
                
                Section {
                    HStack {
                        Text("代号")
                        Spacer()
                        Text("TARS")
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Text("客户端架构")
                        Spacer()
                        Text("SwiftUI + WKWebView (Hybrid)")
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Text("当前版本")
                        Spacer()
                        Text("1.0.0 (Agency)")
                            .foregroundColor(.secondary)
                    }
                } header: {
                    Text("关于 TARS")
                }
            }
            .navigationTitle("连接设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存并连接") {
                        saveAndApply()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                inputURL = config.serverURL
                inputSecret = config.bootstrapSecret
            }
            .confirmationDialog("确定清除所有缓存与凭据吗？", isPresented: $showClearConfirm) {
                Button("清空并重载", role: .destructive) {
                    clearWebViewData()
                }
            } message: {
                Text("这将清空 Cookie、LocalStorage 和已下载的会话资源。")
            }
        }
    }
    
    private func saveAndApply() {
        let trimmedURL = inputURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedSecret = inputSecret.trimmingCharacters(in: .whitespacesAndNewlines)
        
        config.serverURL = trimmedURL.isEmpty ? ServerConfig.defaultServerURL : trimmedURL
        config.bootstrapSecret = trimmedSecret
        
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        reloadTrigger = UUID()
        dismiss()
    }
    
    private func clearWebViewData() {
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        let epoch = Date(timeIntervalSince1970: 0)
        WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: epoch) {
            DispatchQueue.main.async {
                self.clearStatusMessage = "缓存已清空"
                self.reloadTrigger = UUID()
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }
}
