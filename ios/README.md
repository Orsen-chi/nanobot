# TARS - iOS 远程控制客户端

TARS 是专为 NanoBot（部署于 Green Cloud VPS）打造的 iOS 轻量级客户端宿主，基于 SwiftUI + WKWebView 构建。

## 特性亮点

1. **零成本双端同步**：直接承载 WebUI 全功能（包含定制的上下文占用半圆仪表环、模型下拉菜单、Cytoscape 记忆图谱视图等）。
2. **免密静默登录**：
   - 默认直连 VPS 域名：`https://openclaw.dengdeng-2047.com`。
   - 配置 Bootstrap Secret 后，WebView 在加载时通过请求头与 LocalStorage 注入双重机制完成静默鉴权，手机端无需频繁输入密码。
3. **原生交互优化**：
   - **触觉反馈 (Haptic)**：集成 `UIImpactFeedbackGenerator`，供 WebUI 操作时触发细腻物理振动反馈。
   - **原生防丢状态**：网络断开或 VPS 维护时呈现优雅的原生重试卡片。
   - **便捷设置入口**：右下角常驻微透悬浮胶囊工具栏，并支持「摇一摇」手机直接呼出设置面板。
   - **硬件权限桥接**：声明麦克风、相机、相册访问权限，并配置 WKUIDelegate 授权，原生支持语音输入与图片直传。

## 工程构建与运行

工程通过 `xcodegen` 声明式管理：

```bash
# 重新生成工程（若有修改 project.yml）
cd ios && xcodegen generate

# 命令行测试编译
xcodebuild -project TARS.xcodeproj -scheme TARS -destination "generic/platform=iOS Simulator" CODE_SIGNING_ALLOWED=NO build
```

在日常开发调试中，直接双击打开 `ios/TARS.xcodeproj`，选择真机或模拟器即可一键运行。

