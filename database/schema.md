# v0.1 数据库 Schema

本项目使用 CloudBase 文档数据库。所有客户端对三个集合均为 `read: false`、`write: false`；只有 `community` 云函数和控制台可访问。规则文件见 [deny-client.rules.json](deny-client.rules.json)。

这是小程序 v0.1 的最小数据模型，不是未界长期人才库；不导入简历原文、联系方式、微信号、企业端搜索标签或真实社群历史数据。

## members

一人一条。`_id` 是服务端以 `SHA-256(APPID + ':' + OPENID)` 生成的 memberKey；不接受客户端传入的 OpenID、角色或状态。

| 字段 | 类型 | 写入者 | 用途 |
| --- | --- | --- | --- |
| `_id` | string | 云函数 | 稳定成员键 |
| `role` | `member` / `admin` | 云函数首次注册 / 控制台受控授予 | 每次请求服务端鉴权 |
| `active` | boolean | 云函数首次注册 / 控制台受控停用 | 是否允许访问 |
| `profile` | object | 云函数 | 当前职业画像 |
| `consent` | object | 云函数 | `version`、`privacyAccepted`、`opportunityOptIn` |
| `registeredAt`、`profileUpdatedAt` | number | 云函数 | 生命周期时间戳（毫秒） |

`profile` 只允许：`displayName`、`stage`、`organization`、`specialty`、`city`、`directions`、`currentNeed`、`experience`、`shareExperience`。客户端不能直接更新其中任何字段。

## activities

管理员创建草稿，发布后 v0.1 只读。`priceFen` 必须为 `0`，保留字段仅为兼容活动模型，并不表示支持收费。

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `_id` | string (`a-…`) | 客户端生成的活动编号，经服务端格式校验 |
| `status` | `draft` / `published` | 草稿隔离与成员可见性 |
| `version` | number | 乐观并发控制 |
| `title`、`description`、`location`、`refundPolicy` | string | 活动说明 |
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

## 管理员受控操作

普通用户完成建档时，云函数只能写入 `role: member` 和 `active: true`。管理员由环境持有人在控制台手动建立/授予：先核验当事人提供的 memberKey，再设置 `_id`、`role: 'admin'`、`active: true`。停用只改 `active: false`；恢复也必须由受控控制台操作完成。
