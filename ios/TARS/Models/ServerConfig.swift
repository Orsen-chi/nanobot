import Foundation
import Combine

public final class ServerConfig: ObservableObject {
    public static let shared = ServerConfig()
    
    private enum Keys {
        static let serverURL = "tars_server_url"
        static let bootstrapSecret = "tars_bootstrap_secret"
    }
    
    public static let defaultServerURL = "https://openclaw.dengdeng-2047.com"
    
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
        self.bootstrapSecret = UserDefaults.standard.string(forKey: Keys.bootstrapSecret)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
    
    public var targetURL: URL? {
        guard var components = URLComponents(string: serverURL.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return nil
        }
        if components.scheme == nil {
            components.scheme = "https"
        }
        return components.url
    }
    
    public func resetToDefaults() {
        self.serverURL = Self.defaultServerURL
        self.bootstrapSecret = ""
    }
}
