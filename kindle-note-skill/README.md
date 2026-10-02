# Kindle Note Skill

把闲置 Kindle 变成桌面提醒事项、时间和天气信息板。包含可安装的 Codex Skill、手机网页、Node 服务端和 Kindle 端源码。

**发布状态：0.1.0-experimental · V6 电源键修正版。** 用户于 2026-10-02 确认手动休眠/唤醒已通过原设备实机验证；最新组合下的多轮深睡定时同步及长期续航仍待单独确认。不是一键越狱工具，也不是通用 Kindle 固件。

## 功能

- 手机添加、编辑、勾选事项，点击“上传到 Kindle”提交。
- Kindle 上点圆圈完成事项；支持最近一次撤销、断网待提交及冲突保护。
- 事项间等长短实线、留白；本机时间及电量；按网络位置获取城市天气。
- 醒着时更新时钟、检查手机上传；手动休眠后按 RTC 周期联网刷新。
- 电源键控制休眠/唤醒，已在上述原设备验证；其他设备需重新适配。

## 安装 Skill

将本仓库的 `skills/kindle-note` 文件夹复制到自己的 `~/.codex/skills/kindle-note`。重新加载技能后使用：

```text
使用 $kindle-note，先确认我的 Kindle 型号、固件和越狱状态，再为我创建独立部署。
```

也可以让支持 GitHub 技能安装的客户端安装仓库里的 `skills/kindle-note` 路径。Skill 是给 AI 助手的操作指南，不会因安装它就自动改设备。

## 手动开始

需 Node.js 22+、独立 HTTPS 域名/主机，设备已合法越狱且具备可执行脚本入口和 FBInk。部署服务可用 Docker Compose；编译设备触摸辅助程序需要 Zig。

```sh
node skills/kindle-note/scripts/create-instance.mjs /absolute/path/outside-repo/my-kindle https://kindle.example.org
```

脚本只在指定的新目录生成文件、独立密钥和配置，不安装、不启动容器、不写入 USB。接着按 [部署指南](skills/kindle-note/references/deployment.md) 和 [设备指南](skills/kindle-note/references/device.md) 操作。不要把生成的实例目录上传到 GitHub。

已知设备基线：PW4 Wi-Fi / 1072×1448 / firmware 5.18.1.1.1。其他型号需要重新验证触摸设备、坐标、框架和电源接口。查看 [验证范围](skills/kindle-note/references/compatibility.md) 与 [故障处理](skills/kindle-note/references/troubleshooting.md)。

## 隐私与局限

没有公共免费后台，不含作者服务器配置或账号。每位用户部署自己的实例。事项保存在自己的服务端，设备保存缓存及待提交动作。IP 定位和天气会访问第三方服务，不保证所有网络可达；IP 定位不是 GPS。

休眠断网时无法立即接收手机上传；RTC 唤醒不保证整分钟准确；持续唤醒和五秒查询会耗电。尚无可靠续航数据。手机未上传的草稿只在当前页面中，不要关闭。

发布前运行 `node scripts/audit-release.mjs`，见 [发布检查](skills/kindle-note/references/release.md)。本仓库默认不含可执行设备二进制；由使用者为对应架构编译。

## License

项目代码和文档使用 MIT，字体使用随附 SIL OFL；其他运行依赖各自遵循原许可，详见 [THIRD_PARTY.md](THIRD_PARTY.md)。本项目非 Amazon 官方产品，无任何关联或背书。
