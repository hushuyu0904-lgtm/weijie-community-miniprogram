# v0.1 数据库 Schema

本项目使用 CloudBase 文档数据库。所有客户端对所有集合均为 `read: false`、`write: false`；只有 `community` 云函数和控制台可访问。规则文件见 [deny-client.rules.json](deny-client.rules.json)。

这是小程序 v0.1 的最小数据模型，不是未界长期人才库；不导入简历原文、联系方式、微信号、企业端搜索标签或真实社群历史数据。

## members

一人一条。`_id` 是服务端以 `SHA-256(APPID + ':' + OPENID)` 生成的 memberKey；不接受客户端传入的 OpenID、角色或状态。

| 字段 | 类型 | 写入者 | 用途 |
| --- | --- | --- | --- |
| `_id` | string | 云函数 | 稳定成员键 |
| `role` | `member` / `admin` | 云函数首次注册 / 控制台受控授予 | 每次请求服务端鉴权 |
| `active` | boolean | 云函数首次注册 / 控制台受控停用 | 是否允许访问 |
| `profile` | object | 云函数 | 当前职业画像；可选 `avatarFileId` 仅在本人“我的”页展示 |
| `consent` | object | 云函数 | `version`、`privacyAccepted`、`opportunityOptIn` |
| `registeredAt`、`profileUpdatedAt` | number | 云函数 | 生命周期时间戳（毫秒） |

`profile` 只允许：`displayName`、`stage`、`organization`、`specialty`、`city`、`directions`、`currentNeeds`、`experience`、`shareExperience`、`avatarFileId`。其中 `directions` 为 1–5 个方向，`currentNeeds` 为 1–4 个当前希望获得的支持；头像仅接受 CloudBase 存储文件 ID，默认不上传。客户端不能直接更新其中任何字段。

## activities

管理员创建草稿，发布后 v0.1 只读。`priceFen` 必须为 `0`，保留字段仅为兼容活动模型，并不表示支持收费。

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `_id` | string (`a-…`) | 客户端生成的活动编号，经服务端格式校验 |
| `status` | `draft` / `published` | 草稿隔离与成员可见性 |
| `version` | number | 乐观并发控制 |
| `title`、`description`、`location`、`refundPolicy` | string | 活动说明 |
| `coverFileId` | string | 可选 CloudBase 云存储活动封面文件 ID |
| `category` | `coffee` / `outing` / `lecture` / `chat` / `other` | 列表分类 |
| `priceFen` | number | v0.1 固定为 0 |
| `capacity`、`registrationCount` | number | 容量与已确认人数 |
| `startAt`、`endAt`、`deadlineAt` | number | 毫秒时间戳 |
| `createdBy` | string | 仅服务端内部追溯，不返回成员端 |
| `createdAt`、`updatedAt`、`publishedAt` | number | 生命周期时间戳 |

索引：`status` 升序、`createdAt` 降序、`_id` 降序；另建 `createdAt` 降序、`_id` 降序。

## registrations

一名成员在一场活动中只有一条记录。`_id` 是服务端计算的 `SHA-256(activityId + ':' + memberKey)`；报名必须在服务端事务内写入。

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `_id` | string (`r-…`) | 去重键 |
| `activityId`、`memberKey` | string | 关联活动与成员 |
| `status` | `confirmed` / `waitlist` | 报名结果 |
| `createdAt` | number | 排队顺序 |
| `activityTitle`、`activityStartAt`、`location` | snapshot | “我的报名”稳定展示 |
| `displayName`、`organization`、`specialty` | snapshot | 管理员名单最小摘要 |

索引：`memberKey` 升序、`createdAt` 降序；`activityId` 升序、`createdAt` 升序。

不实现取消报名、自动候补转正或修改名单；这些都需要新的状态机和真实运营规则后再设计。

## connectionRequests

这是“我想寻找相似背景的人聊 20 分钟 / 我愿意分享经历”的私密申请队列，不是用户搜索、即时聊天或自动配对。申请人始终只有自己的一条当前申请；再次提交会更新该申请并重新进入 `submitted`。不保存手机号、微信号、简历或对方联系方式。

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `_id` | string (`c-…`) | 服务端按 memberKey 生成的稳定申请键 |
| `memberKey` | string | 仅云函数内部关联申请人 |
| `intent` | `seek` / `share` | 希望交流或愿意分享 |
| `directions` | string[] | 1 至 5 个职业方向 |
| `introduction`、`question`、`availability` | string | 申请人的最小必要说明 |
| `profileSummary` | object | 管理员审核用最小职业摘要 |
| `status` | `submitted` / `reviewing` / `closed` | 运营审核状态，不等于已经匹配成功 |
| `operatorNote` | string | 仅申请人和管理员可见的运营备注 |
| `createdAt`、`updatedAt` | number | 生命周期时间戳 |

索引：`memberKey` 升序、`updatedAt` 降序；另建 `updatedAt` 降序供管理员审核列表使用。

当前云函数已提供创建、查看本人、管理员列表与审核状态接口；前端仍是本地填写样板，待活动闭环真实验收后再接入。真正介绍双方前，仍需要运营确认和双方同意，不能仅凭 `reviewing` 状态公开联系方式。

## resources

运营发布、成员浏览的轻量资源库。它不是企业招聘库，也不收录成员简历、联系方式或可被企业检索的人才标签。资源可提供正文、HTTPS 来源链接，或两者同时提供；外部链接在小程序中只提供复制，不直接收集第三方数据。

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `_id` | string (`s-…`) | 管理端生成、服务端校验的资源编号 |
| `status` | `draft` / `published` | 草稿隔离与成员可见性 |
| `version` | number | 乐观并发控制 |
| `title`、`summary`、`content` | string | 标题、简介与旧版纯文本正文；旧资源仍可读取 |
| `coverFileId` | string | 可选 CloudBase 云存储封面图文件 ID |
| `blocks` | array | 图文长文内容块：`heading`、`paragraph`、`quote`、`image`；最多 32 块、6 张正文图 |
| `category` | `opportunity` / `news` / `knowledge` / `recap` | 资源分类 |
| `sourceLabel`、`sourceUrl` | string | 可选来源说明与 HTTPS 链接；转载全文前须确认授权 |
| `createdBy` | string | 仅服务端内部追溯，不返回成员端 |
| `createdAt`、`updatedAt`、`publishedAt` | number | 生命周期时间戳 |

索引：`status` 升序、`category` 升序、`createdAt` 降序、`_id` 降序；另建 `createdAt` 降序、`_id` 降序供管理员管理列表使用。

## 管理员受控操作

普通用户完成建档时，云函数只能写入 `role: member` 和 `active: true`。管理员由环境持有人在控制台手动建立/授予：先核验当事人提供的 memberKey，再设置 `_id`、`role: 'admin'`、`active: true`。停用只改 `active: false`；恢复也必须由受控控制台操作完成。
