# Localization / 多语言开发

The Community interface supports 13 bundled locales. This is a focused port of the general localization work from the 0.3.19 product release onto the existing public source, not a full product-source synchronization.

Community 界面提供 13 种内置语言。本次将 0.3.19 的通用多语言功能移植到现有公开代码，并非同步整个产品版本。

| Code | Language / 语言 |
| --- | --- |
| `zh-CN` | 简体中文 |
| `zh-TW` | 繁體中文 |
| `en` | English |
| `ru` | Русский |
| `vi` | Tiếng Việt |
| `th` | ไทย |
| `pt-BR` | Português (Brasil) |
| `fr` | Français |
| `uk` | Українська |
| `es` | Español |
| `tr` | Türkçe |
| `ja` | 日本語 |
| `hi` | हिन्दी |

## Selection / 语言选择

On startup, `src/main/ui-language.ts` reads the primary OS display language. Unsupported or unavailable languages resolve to English. A valid manual preference in `ui-language.json` under Electron's user-data directory takes precedence. The upper-right selector changes the interface and native application menu without restarting. Catalogs are bundled locally; no profile text is sent to a translation service.

启动时读取系统首选显示语言；不支持或无法读取时默认英语。手动选择保存在 Electron 用户数据目录的 `ui-language.json` 中，优先于系统语言。右上角可即时切换界面和应用菜单，无需重启。词库内置，不会将环境文本发送到翻译服务。

Interface preferences are separate from browser profiles: names, notes, groups, tags, proxy settings, fingerprint language, time zone and unsaved drafts retain their values. Backend identifiers, validation rules and protocol values must never be translated.

界面偏好与浏览器环境独立：名称、备注、分组、标签、代理、指纹语言、时区和未保存草稿均保持原值。后端标识、校验规则和协议值不得翻译。

## Contributing / 贡献翻译

- Edit the JSON catalogs in `src/shared/locales/`. Use the same source keys in all 13 files and retain every numbered placeholder (`{0}`, `{1}`, …).
- Use `t('源文案', value)` for interface text. Pass user values as interpolation arguments, never as translation keys.
- Use `translateMessage` only for application-owned status/error text. Keep publisher announcements and user content verbatim.
- Resolve labels during rendering and include the active locale in memo dependencies. Avoid language-dependent React keys that would remount forms.
- Native dialogs and generated copy/import name suffixes share the main-process locale. Use `suffixedProfileName` to respect the existing name-length limit.

编辑 `src/shared/locales/` 中对应语言的 JSON，保持 13 份词库键名一致，保留占位符。用户内容通过参数插入，禁止作为词条翻译；状态翻译只处理应用自身文案。切换语言应触发重新渲染，不应重新挂载表单。新增翻译不得携带密钥或私有发布配置。

## Verification / 验证

From the repository root / 在仓库根目录执行：

```sh
npm ci
npm test
npm run build
node tools/i18n/smoke.mjs
```

The unit suite checks OS-language resolution, saved preferences, English fallback, catalog keys/placeholders and generated names. The desktop smoke test requires a graphical desktop and the Electron installed by `npm ci`; it uses an isolated temporary profile, exercises all 13 selectors, checks profile and draft preservation, and restarts to verify persistence. Results and screenshots are written to the OS temporary directory under `prism-community-i18n-results`; override with `--output <directory>`.

单元测试覆盖系统语言匹配、保存偏好、英语兜底、词库与占位符、生成名称长度。桌面冒烟测试需要图形桌面和项目 Electron；它使用独立临时数据目录，逐一验证 13 种语言、环境与草稿保留、重启后偏好保留。报告及截图保存在系统临时目录的 `prism-community-i18n-results` 中，也可用 `--output <目录>` 指定位置。

This test does not require a private runtime or start a browser kernel. Desktop UI verification for this port was performed on macOS; Windows-specific startup behavior is covered by mocked Electron unit tests, not a Windows device run.

该测试无需私有运行时，也不启动浏览器内核。本次移植的桌面界面验证在 macOS 完成；Windows 相关启动逻辑由模拟 Electron 的单元测试覆盖，未进行 Windows 真机验证。
