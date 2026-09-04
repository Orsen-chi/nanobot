import Foundation
import Combine

public final class ServerConfig: ObservableObject {
    public static let shared = ServerConfig()
    
    private enum Keys {
        static let serverURL = "tars_server_url"
        static let bootstrapSecret = "tars_bootstrap_secret"
    }
    
    public static let defaultServerURL = "https://openclaw.dengdeng-2047.com"
    public static let defaultBootstrapSecret = "Qq814345957..,,"
    
    @Published public var serverURL: String {
        didSet {
            UserDefaults.standard.set(serverURL, forKey: Keys.serverURL)
        }
    }
    
    @Published public var bootstrapSecret: String {
        didSet {
            UserDefaults.standard.set(bootstrapSecret, forKey: Keys.bootstrapSecret)
        }
    }
    
    public init() {
        let savedURL = UserDefaults.standard.string(forKey: Keys.serverURL)?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.serverURL = (savedURL?.isEmpty == false) ? savedURL! : Self.defaultServerURL
        
        let savedSecret = UserDefaults.standard.string(forKey: Keys.bootstrapSecret)?.trimmingCharacters(in: .whitespacesAndNewlines)
        // 如果未设置或设置为空，默认使用专属密码 Qq814345957..,,
        if let savedSecret = savedSecret, !savedSecret.isEmpty {
            self.bootstrapSecret = savedSecret
        } else {
            self.bootstrapSecret = Self.defaultBootstrapSecret
            UserDefaults.standard.set(Self.defaultBootstrapSecret, forKey: Keys.bootstrapSecret)
        }
    }
    
    public var targetURL: URL? {
        var raw = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty {
            raw = Self.defaultServerURL
        }
        guard var components = URLComponents(string: raw) else {
            return nil
        }
        if components.scheme == nil {
            components.scheme = "https"
        }
        
        // 如果配置了密钥且 URL 中尚未包含 hash 凭证，在初始进入时带上直通参数
        let secret = bootstrapSecret.trimmingCharacters(in: .whitespacesAndNewlines)
        if !secret.isEmpty && (components.fragment == nil || components.fragment?.contains("bootstrapSecret") == false) {
            if let encodedSecret = secret.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
                components.fragment = "/?bootstrapSecret=(encodedSecret)"
            }
        }
        
        return components.url
    }
    
    public func resetToDefaults() {
        self.serverURL = Self.defaultServerURL
        self.bootstrapSecret = Self.defaultBootstrapSecret
    }
}

