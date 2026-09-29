# 未界人才数据库接入契约

契约版本：1.0.0 草案。依据小程序仓库main提交 `e1a5365f8f3b6d467d7a49fbaaa1d8a469f0a0bd`，编写日期2026-09-27。

本目录定义微信小程序通过现有community云函数采集选择题，形成结构化人才画像，并与MedTalent数据库交换数据的契约。它是schema与接入设计，尚未实现云函数action、问卷页面、数据同步或生产迁移。复制JSON到CloudBase控制台不会自动建表，也不会自动启用校验。

## 文件入口

| 文件 | 用途 |
|---|---|
| collections.schema.json | JSON Schema Draft 2020-12，10个新增集合的文档结构与类型 |
| requests.schema.json | community新增8个action的请求白名单 |
| catalog.seed.json | 63个示范概念、11个字段；draft状态，仅用于开发验证 |
| questionnaire.seed.json | 11道选择题、分支及自述能力映射；draft状态 |
| submit.example.json | 全选择题提交示例，不包含客户端自报身份或能力分 |
| profile.example.json | 服务端派生画像示例，能力仅标为未核验自述 |
| exchange.schema.json | MedTalent交换包的结构，含版本和删除/撤回事件 |
| exchange.example.json | 仅含合成人才ID的服务端交换示例，无微信标识 |
| collections-and-indexes.json | 集合权限与索引设计清单，不是CLI配置文件 |
| validate.py | 离线schema和跨字段语义检查，不是生产服务端代码 |
| requirements-dev.txt | 离线验证依赖，不修改现有云函数依赖 |

完整接口、旧字段映射、并发/幂等、同步和上线顺序见仓库 `docs/medtalent-integration-schema.md`。

## 验证

在本目录运行：

```sh
python -m pip install -r requirements-dev.txt
python validate.py
```

使用真实JSON Schema验证器；不能只运行JSON.parse就称schema验证通过。schema不能独立校验选项属于哪题、分支、角色、授权或事务，因此同时提供语义检查示范。后端采用JavaScript实现时须迁移这些规则并增加真实身份和并发测试。

单个集合文档的校验方式是包装为：

```json
{"collection":"talent_profiles","document":{"这里替换为":"完整画像文档"}}
```

上面仅说明包装格式，不是合法业务示例。完整画像见profile.example.json。也可将对应`$defs`作为验证入口，同时保留根级所有定义以解析引用。

## 边界

- `_id`、personId、版本、服务器时间、核验状态及衍生技能全部由服务端管理。
- 时间遵循现有小程序：Unix毫秒整数；按Asia/Shanghai显示，精确到月的经历另用字典编码，不伪造具体日期。
- 所有新增集合复用read:false、write:false规则思想，通过云函数访问；规则文件必须在真实环境应用和验证。
- members、activities、registrations及当前community接口不被本目录改动；未实现前调用新action仍会被当前后端拒绝。
- 示例城市、行业与技能目录不完整；允许“目录未收录/不知道/暂不提供”，不能为了通过注册让用户选错。
- 企业检索、公开个人资料、付费业务和自动录用不在本次契约范围。
