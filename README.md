# OWCS 2026 广州 · 座位全景图（大神小游戏专区静态包）

> 给网易大神对接方：拿 Releases 里的 zip 直接部署，按下文「接入」一节注入 `window.DashenSeatAdapter` 就能接上账号、存储和私信。不注入适配器时页面以试玩模式运行，可以先打开看看效果。截图见 `docs/shots/`。

OWCS 2026 全球总决赛（2026-12-04 至 12-06，广州体育馆 1 号馆）的「全景图选座」：玩家选择自己坐在哪个区、哪一排（排可以不填），然后在 3D 场馆里看到自己和同场的其他玩家，也可以按分区查看人数，并生成一张座位海报。

这是一个**纯静态前端包**：一个 `index.html`，加上 `assets/` 目录里的一个 js 文件和一个 css 文件，全部用相对路径引用。可以放在任意路径下，也可以直接用 `file://` 打开。账号、存储、跨设备同步和站内私信都由宿主（网易大神）注入的适配器负责，包本身没有后端。

## 承诺

- **包内不发出任何网络请求，可以抓包验证。** 代码里没有 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、动态 `import()`，也没有统计或埋点；不加载任何图片、字体、CDN 或外部脚本（three.js 已经打包进 js，字体只用系统字体）。验证方法见下文的「抓包和静态扫描」。
- **不收集任何用户数据。** 页面上只显示宿主给出的大神昵称，以及用户自己选的区、排（填了才显示）和一个预设标签。页面不要求填写座号，没有自由输入框，也没有票根识别和图片上传。
- **不含任何来自游戏客户端或抓包的数据。** 场馆分区按公开的售票座位图画出，每个区的排数是估算的（见 `src/layout.ts`）；没有英雄、段位或战绩数据。
- 「游戏角色信息」只保留一个开关 `showGameRole`，**默认关闭**。关闭时，即使适配器返回了 `role` 字段，页面也不会使用。
- 导流到第三方的链接（`promoLink`）**默认为空，页面上不渲染**。

## 目录

```
dashen-seat/
├── index.html            入口（构建时 Vite 会把它改成相对路径引用的普通脚本）
├── src/
│   ├── main.ts           页面：日期切换、3D/平面图、选座、附近的人、海报
│   ├── adapter.ts        适配器接口 + 试玩模式（localStorage + 假用户）+ 返回数据清洗
│   ├── config.ts         可配置项（赛期、预设标签、角色开关、导流链接）
│   ├── layout.ts         场馆分区布局（公开座位图 + 排数估算）
│   ├── scene.ts          three.js 3D 场馆
│   ├── plan.ts           2D 平面图（海报、无 WebGL 时的降级页面共用）
│   ├── poster.ts         座位海报（本地 canvas 绘制）
│   └── style.css
├── scripts/
│   ├── check-dist.mjs    扫描构建产物：网络 API、URL、域名
│   ├── shot.mjs          无头 Chrome 以 file:// 打开，走一遍选座流程、截图、记录请求
│   └── pack.mjs          打 zip 包到 release/
└── vite.config.ts        base './'，输出 IIFE 普通脚本，不带 modulepreload polyfill
```

## 构建

需要 Node 20 或更高版本。

```bash
npm ci
npm run build                     # tsc 类型检查 + vite build → dist/
npm run check                     # 扫描 dist/，有可疑内容时退出码为 1
npm run pack                      # build + check + 打包 release/dashen-seat-<version>.zip
node scripts/shot.mjs             # 无头 Chrome 走一遍流程，截图存到 shots/
node scripts/shot.mjs --no-webgl  # 同上，但关闭 WebGL（验证降级为平面图）
```

本地预览：直接打开 `dist/index.html`，或者在 `dist/` 下随便起一个静态服务。

## 接入：`window.DashenSeatAdapter`

宿主只需要注入一个对象：

```ts
interface DashenAdapter {
  getProfile(): Promise<{ id: string; nickname: string }>;
  listSeats(day: string): Promise<Array<{ id: string; nickname: string; section: string; row?: number; tag?: string }>>;
  saveSeat(day: string, section: string, row?: number, tag?: string): Promise<void>;
  removeSeat(day: string): Promise<void>;
  openChat?(userId: string): void;
}
```

| 方法 | 说明 |
| --- | --- |
| `getProfile()` | 当前登录用户。`id` 只用来在 `listSeats` 的结果里认出「我」，以及传给 `openChat`；页面上只显示 `nickname`。 |
| `listSeats(day)` | 这一天**所有**选了座位的人，**包括当前用户自己**（按 `id` 匹配）。`day` 的格式是 `YYYY-MM-DD`，取值为 `2026-12-04`、`2026-12-05`、`2026-12-06`。 |
| `saveSeat(day, section, row?, tag?)` | 新增或覆盖当前用户这一天的座位（每人每天一条）。用户勾选了多天时，会对每一天各调用一次。 |
| `removeSeat(day)` | 取消当前用户这一天的座位。 |
| `openChat(userId)` | 可选，打开大神站内私信。没有提供时，「私信」按钮显示为不可点。 |

**字段**

- `section`：分区名，取值只能是 `AA BB CC DD EE FF GG HH II JJ`（内圈）、`A B C D E F G H I J`（中圈）、`K L M N`（外圈），共 24 个。不在这个列表里的记录会被丢掉。
- `row`：可选，取值为 1–99 的正整数。页面上可选的排数按各区的估算排数生成：内圈 12 排，中圈 10 排，外圈 6 排，C 区和 D 区 16 排。
- `tag`：可选，只能是 `config.tags` 里的某个预设值，否则忽略。这是在你们给的接口基础上**新增的可选参数**，不支持的话直接忽略即可。
- `role`：可选（`重装` / `输出` / `支援`），只有 `showGameRole: true` 时才会使用。默认不传。
- 页面只读取上面这些字段，多余的字段会被丢弃。昵称截断到 24 个字，只通过 `textContent` 渲染，不会当作 HTML 解析。
- 任何方法 `throw new Error("给用户看的文字")`，页面都会把这段文字原样提示给用户。

**注入时机**：二选一。

1. 在包内脚本执行之前挂到 `window.DashenSeatAdapter` 上。包内脚本是 `defer` 加载的，所以在 `index.html` 的 `<head>` 里内联一段脚本，或者 webview 在 document start 时注入，都来得及。
2. 晚一点再注入也可以：调用 `window.DashenSeat.setAdapter(adapter)`，页面会退出试玩模式，重新加载数据。

示例：

```html
<script>
  window.DashenSeatAdapter = {
    getProfile: () => DS.user.current().then((u) => ({ id: u.uid, nickname: u.nick })),
    listSeats: (day) => DS.store.query("owcs-seat", { day }),
    saveSeat: (day, section, row, tag) => DS.store.put("owcs-seat", { day, section, row, tag }),
    removeSeat: (day) => DS.store.remove("owcs-seat", { day }),
    openChat: (uid) => DS.im.open(uid),
  };
</script>
```

（`DS.*` 只是占位，这里换成大神自己的 SDK。）

没有注入适配器（或者注入的对象缺少前 4 个方法中的任何一个）时，页面进入**试玩模式**：右上角显示「试玩模式」标记，内置 14–22 个固定的假用户（昵称都以「试玩·」开头），用户自己的座位存在本机 `localStorage` 的 `dashen-seat:demo:v1` 键下。注入适配器之后，包不会读写任何本地存储。

## 配置：`window.DashenSeatConfig`

在包内脚本执行之前设置，任何字段都可以不填，默认值见 `src/config.ts`。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `title` / `event` / `venue` | OWCS 2026 广州相关文案 | 页面标题和海报文案 |
| `days` | 12.4 周五、12.5 周六、12.6 周日 | 赛期，`day` 字段就是传给适配器的 key |
| `tags` | 第一次来线下、一个人来的、带了应援物、求合影、坐等开赛、散场一起吃饭 | 预设的头顶标签，没有自由输入 |
| `showGameRole` | `false` | 是否按角色定位给人物上色 |
| `promoLink` / `promoText` | `""` | 底部一行纯文字链接。只接受不带参数、不带 `#` 的 https 地址，其他值一律忽略。为空时不渲染。 |
| `maxFigures` | 300 | 3D 场馆里最多画多少人：先画自己，再画同区的人，最后画其他人。各区人数的统计总是用全部数据。 |

## 降级

- 没有 WebGL（webview 不支持、硬件加速关闭、驱动被列入黑名单），或者 WebGL 上下文丢失时，自动切换到 2D 平面分区图：各区按人数着色，标出自己的位置，点一个区可以列出这个区的人。选座、附近的人、海报这些功能照常可用。
- 在 URL 末尾加 `#2d`，可以强制使用平面图。在 3D 模式下也可以点「平面图」按钮手动切换。

## 抓包和静态扫描

1. 抓包：用 Charles 或 mitmproxy 挂上手机，在大神里打开页面，把选座、切换日期、生成海报都走一遍。除了宿主自己的请求以外，应该看不到任何请求。在桌面上，可以用 Chrome DevTools 的 Network 面板打开 `dist/index.html` 观察，只会看到 `file:` 和 `data:`（海报图）请求。`node scripts/shot.mjs` 会自动记录这些请求，一旦出现其他协议的请求就判定失败。
2. 静态扫描：`npm run check`。扫描规则：网络 API（`fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`sendBeacon`、`import()`、`Worker`、`new Image`、`.src=`、`url(`、`/api/`、`document.cookie`、`window.open`）以及任何 `http(s)://` 或 `//域名` 形式的字符串。

构建产物里唯一允许出现的 URL 形式的字符串：

| 字符串 | 出处 | 为什么不是请求 |
| --- | --- | --- |
| `http://www.w3.org/1999/xhtml` | three.js `createElementNS` | XML 命名空间标识，用来创建 `<canvas>` 元素，不会发起网络请求 |

另外，构建产物还会读取这几个浏览器 API，都只在本地读，不往外发：`navigator.userAgent`（three.js 判断是不是 Oculus 浏览器）、`location.hash`（`#2d`）、`localStorage`（仅试玩模式）。海报图是 `canvas.toDataURL` 生成的 `data:` 地址。

## 下载和包体积

构建好的 zip 在本仓库的 GitHub Releases 页面（`dashen-seat-<version>.zip`，解压后就是可以直接部署的 `index.html` + `assets/`）；自己构建时运行 `npm run pack`，产物在 `release/` 目录下。js 文件大约 500 KB，gzip 后约 130 KB，绝大部分是 three.js；css 文件约 8 KB。

## 待和大神确认

1. 适配器的注入方式：是 `window.DashenSeatAdapter` 这种对象，还是大神有现成的 JS SDK 或 JSBridge？返回字段名能否对齐（`id` / `nickname`）？
2. 多出来的可选 `tag` 参数（预设头顶标签），后端是否愿意存？不存的话页面上就不显示标签，其他功能不受影响。
3. 小游戏专区对包体积和文件数有没有上限？能否放进 zip？入口必须叫 `index.html` 吗？
4. 大神 App 的 webview（iOS 和 Android）是否支持 WebGL？不支持也没关系，会自动降级成平面图，但需要知道大致比例。
5. 有没有内容安全策略（CSP）的要求？包本身不需要任何外部来源；如果加 `connect-src 'none'`，你们注入的适配器自己的请求也会被拦截，所以 CSP 建议由宿主自己决定怎么配。
6. 导流链接（`promoLink`）能不能放？放的话放在什么位置、用什么文案？
7. 「游戏角色信息」（`showGameRole`）是否保持关闭？
8. 海报底部的「网易大神 · 座位全景图」署名能不能用？
