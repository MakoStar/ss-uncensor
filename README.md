# 星塔反和谐工具

星塔反和谐工具：Electron 桌面端

> 开发测试版（alpha），仅供个人学习研究使用，请自行承担风险。

## 使用方法

发布页有两个包，功能完全一样，挑一个：

- **安装版** `ssuncensor-*-setup.exe`：双击安装，目录可自选，自带卸载器。
- **免安装版** `ssuncensor-*-win-x64.zip`：解压出 `ssuncensor/` 目录，双击里面的 `星塔反和谐工具.exe` 直接运行，不写注册表。

### 安全提示

应用没有代码签名证书，Windows 会拦，弹窗点 **更多信息 -> 仍要运行**：


## 开发

```bash
npm install          # 装依赖 + electron 二进制（走 npmmirror）
npm run dev          # 开发模式，渲染层热更新
npm run start        # 构建后启动
npm run build        # 只构建
npm run dist         # 出 Windows 安装包到 release/
npm run selftest     # 无界面自检
```

<!-- 
## 发布

```bash
git tag v0.1.0-alpha.2
git push origin v0.1.0-alpha.2
```
-->

## 许可证

[GNU AGPL-3.0-or-later](LICENSE)。修改后分发（包括作为网络服务提供）必须同样开源。
