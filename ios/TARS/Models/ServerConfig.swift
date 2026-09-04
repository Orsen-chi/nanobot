import Foundation
import Combine

public final class ServerConfig: ObservableObject {
    public static let shared = ServerConfig()
    
    private enum Keys {
        static let serverURL = "tars_server_url"
        static let bootstrapSecret = "tars_bootstrap_secret"
        static let configVersion = "tars_secret_config_version_v3"
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
        
        // 检查配置版本，如果版本不匹配，强制覆盖真机沙盒中残留的旧错误凭证
        let currentVersion = UserDefaults.standard.integer(forKey: Keys.configVersion)
        if currentVersion < 3 {
            self.bootstrapSecret = Self.defaultBootstrapSecret
            UserDefaults.standard.set(Self.defaultBootstrapSecret, forKey: Keys.bootstrapSecret)
            UserDefaults.standard.set(3, forKey: Keys.configVersion)
        } else {
            let savedSecret = UserDefaults.standard.string(forKey: Keys.bootstrapSecret)?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let savedSecret = savedSecret, !savedSecret.isEmpty {
                self.bootstrapSecret = savedSecret
            } else {
                self.bootstrapSecret = Self.defaultBootstrapSecret
                UserDefaults.standard.set(Self.defaultBootstrapSecret, forKey: Keys.bootstrapSecret)
            }
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
        if components.path.isEmpty {
            components.path = "/"
        }
        
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
        UserDefaults.standard.set(Self.defaultBootstrapSecret, forKey: Keys.bootstrapSecret)
        UserDefaults.standard.set(3, forKey: Keys.configVersion)
    }
}

