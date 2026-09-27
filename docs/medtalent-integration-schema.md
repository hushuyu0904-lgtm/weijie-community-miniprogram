# 未界小程序与医学人才数据库接入 Schema

版本1.0.0草案｜2026-09-27

## 1 结论与适用范围

采用“现有微信身份与社群成员 + 新增人才采集集合 + 服务端MedTalent适配器”。CloudBase负责小程序登录、选择题与业务查询；MedTalent负责更丰富的标准人才结构、分析与匹配。前端不直连PostgreSQL，也不持有数据库密码。

本次交付的是可校验数据契约、选择题种子和接入步骤，不是已经上线的数据库功能。当前仓库的云函数、页面、活动和报名业务代码均保持原样。新action需要后续实现，不能将schema文件存在仓库当成生产校验已启用。

读取基线：[main提交e1a5365](https://github.com/hushuyu0904-lgtm/weijie-community-miniprogram/tree/e1a5365f8f3b6d467d7a49fbaaa1d8a469f0a0bd)。已核对community云函数、onboarding页、mine页、cloud服务、权限规则及云环境/协作说明。仓库树未列出AGENTS.md。

未取得MedTalent实际DDL与字段字典，因此本方案定义中立交换包与映射规则，不声称可以直接插入其未知物理表。与MedTalent的最终字段ID、代码值和关系约束须由适配器依据正式字典映射。

## 2 与当前代码的对应

| 当前实现 | 本次接入方式 |
|---|---|
| 微信原生小程序，wx.cloud调用community | 延续同一调用方式与ok/data/code/message返回外壳 |
| getWXContext验证OPENID/APPID，校验WECHAT_APPID | 延续可信身份检查；客户端不传personId、memberKey、role或active |
| memberKey为SHA256(APPID + ':' + OPENID) | 保留members._id；仅在人才身份关联集合映射到随机personId |
| members.profile中9个固定字段 | 保留兼容展示投影；完整人才信息移入talent_*集合 |
| completeOnboarding/updateProfile接受固定字段 | 不往旧接口偷偷加字段；新增submitTalentProfile，实施时再增加路由 |
| 注册页强制输入称呼、机构、专业、城市 | 新页面以字典选择为主；称呼可服务端生成，目录缺失可明确表示 |
| registrations保存displayName、organization、stage快照 | 新注册事务生成兼容profile；历史报名快照不随画像更新反复覆盖 |
| 活动管理员权限 | 不自动扩展为批量读取人才、导出或同步权限 |
| database/deny-client.rules.json | 所有新增集合继续拒绝客户端直读写，服务端逐操作校验 |
| jobs页当前为占位 | 岗位与匹配schema作为后续接入投影，不宣称页面已实现 |

## 3 数据流和职责

小程序获取指定已发布问卷及字典 → 用户选择 → community验证身份、版本、选项与分支 → 事务写入提交历史、画像、授权事件及待同步事件 → 服务端适配器写入MedTalent → 可发布岗位与匹配结果回流CloudBase → 小程序按本人身份读取。

CloudBase是本渠道原始答案和授权事件的事实来源；MedTalent是标准化分析和匹配结果的来源。禁止两边同时不受约束地覆盖同一原始答案。运营更正或MedTalent核验应写新来源记录，通过单独受控流程合并，不把核验结果伪装成用户选项。

首期只有CloudBase也能完成采集与自述画像；MedTalent同步未完成时返回pending，不显示“数据库分析已完成”。

## 4 集合与主键

详见`database/medtalent/v1/collections.schema.json`。

| 集合 | 粒度与主键 | 用途 |
|---|---|---|
| talent_links | _id=memberKey；personId唯一 | 微信成员与随机人才ID映射、状态及全局递增版本 |
| talent_catalogs | 固定版本ID，如catalog_1.0.0 | 字段、选项值概念、行业、职能、技能、同义/兼容映射 |
| talent_questionnaires | questionnaireId+版本组成的不可变ID | 题目、选项、分支、重复组、技能映射、告知版本 |
| talent_submissions | 服务端稳定ID；personId+requestId唯一 | 一次完整提交快照、原始选择与问卷版本 |
| talent_profiles | _id=personId | 当前自述画像、来源、服务端派生检索字段 |
| talent_consent_events | 一人一次用途授权/撤回一条 | personal_analysis与opportunity_notifications分别管理 |
| talent_outbox | 服务端稳定eventId | 与源数据同事务创建的待同步事件，不存裸密钥或重复完整画像 |
| talent_jobs | 外部岗位稳定映射ID | 供小程序读取的岗位投影，保留原始依据、有效性和要求逻辑 |
| talent_match_results | 一次规则版本下的人岗结果 | 画像版本、岗位版本、命中/缺口/未知、覆盖率 |
| talent_rights_requests | personId+requestId唯一 | 人才资料删除的受理与完成状态 |

所有时间为Unix毫秒安全整数，页面按北京时间显示。UUID等随机personId不含微信标识。memberKey虽不是密码，仍为可关联身份标识，不进入MedTalent普通分析包。不能按相同学校、姓名或手机号猜测合并两个人。

### 4.1 版本与字典

schemaVersion管理结构；questionnaireVersion管理题目；catalogId锁定代码字典；mappingVersion管理答案到画像规则；profileVersion记录画像来源版本；aggregateVersion是每个person单调递增的业务事件顺序；岗位有sourceVersion，匹配有ruleVersion。

发布后的问卷、映射和字典内容不可就地改写。发布新版本，旧问卷停用状态可变，定义保留解释用途。概念ID不复用；拆分合并用迁移表，不把历史“其他”自动变成某个新职业。旧字段不可准确回填时保留not_collected_in_version。

### 4.2 选择题与重复经历

回答采用questionId、instanceId、status、optionIds；不接受任意text。单选最多一项，多选最多按题目配置；互斥“没有”不能和其他经历一起选择。

支持教育、科研、工作等重复卡片：先声明instances，如education/edu_1及education/edu_2，同一题分别在两个instanceId下回答。groupId与instanceId不能只存展示序号。种子仅含基础11题，重复教育能力通过离线测试演示，完整教育/实习/科研模块需按正式MedTalent字典扩展。

缺失状态区分unknown、skipped、not_asked、not_applicable、prefer_not_to_say、not_collected_in_version和not_in_catalog。客户端只能使用题目允许的状态；not_collected_in_version仅由迁移工具生成。隐藏题必须not_asked；必答题可按明确配置选不知道或不愿提供，但不能静默跳过。

UI不默认选中第一项，否则会把未操作当作已确认。机构、城市等长字典可按层级选择；种子未覆盖全国学校、城市，必须允许目录未收录，不能强制填写或选错。日期可以用年月选择器并转换为登记代码；不得推算不存在的精确日。

### 4.3 画像与分析

facts保存稳定fieldId、标准valueCodes、重复组实例及原始答案来源。skillClaims只表达行为题导出的未核验自述，不含任意置信概率，不把医学学历直接转换成技能。

facets是服务端可重建查询投影，包含阶段、学位、城市、职能、行业。与facts不一致时以版本锁定的原始答案和映射规则重建，不能让前端直接修改facets。

facts是灵活的采集交换表示，不主张MedTalent长期只保留一张EAV表。适配器应将education组、experience组、能力、偏好拆入其正式规范表，另生成稳定分析宽表；临床、科研、企业、运营等经历使用共同主干及专用扩展。

## 5 前后端接口约定

云函数仍为community；`miniprogram/services/cloud.js`的call(action,payload)方式可继续使用。下列接口为新增设计，当前代码均未实现。请求完整类型见requests.schema.json。

| action | 谁可用 | 返回data契约 |
|---|---|---|
| getTalentQuestionnaire | 可信微信身份；已停用成员拒绝 | {questionnaire,catalog}；仅published版本，questionnaire去掉服务端skillRules，catalog仅返回本问卷需要的字段/概念 |
| submitTalentProfile | 可信身份的新用户或有效成员 | {profileVersion,submissionId,hasTalentProfile:true,syncStatus:'pending'或'delivered'}；事务提交后才成功 |
| getMyTalentProfile | 有效成员且本人授权有效 | {profile:null或talent_profiles结构,syncStatus:'not_configured'/'pending'/'delivered'/'failed'} |
| setTalentConsent | 可信身份、本人存在的人才记录；允许停用成员撤回，停用成员不得新授予 | {purpose,granted,aggregateVersion}；不能用此接口授予企业分享 |
| listTalentJobs | 有效成员 | {items:talent_jobs数组,nextCursor:null或游标}；每页至多20项，只返回open且未过截止日 |
| getMyTalentMatches | 有效成员、个人分析授权有效 | {items:talent_match_results数组,nextCursor:null或游标,profileVersion}；仅当前有效版本，无结果返回空数组 |
| requestTalentDeletion | 可信微信身份且有关联；停用成员仍可删除自己的资料 | {requestId,status:'pending'/'processing'/'completed'/'failed'}；受理不等于删除完成 |
| getTalentDeletionStatus | 可信身份及本人请求 | {requestId,status,completedAt:null或时间,downstreamConfirmed}；不可查询他人请求 |

所有成功返回 `{ok:true,data}`；失败 `{ok:false,code,message}`。保留现有NOT_CONFIGURED、UNAUTHENTICATED、FORBIDDEN、INVALID_ARGUMENT、NOT_FOUND、CONFLICT、BACKEND_ERROR，新增QUESTIONNAIRE_RETIRED、CONSENT_REQUIRED、UPGRADE_REQUIRED、PROFILE_DELETING。前端不得遇到错误后回落到演示成功。

getMyTalentProfile返回null仅表示本人尚无人才画像；撤回分析许可时应返回CONSENT_REQUIRED或专门的权利管理视图，不能继续返回完整派生画像。用户查阅/导出本人原始资料需要后续权利接口，不能因停止分析而剥夺其访问权。

请求的身份字段均禁止。平台若附加userInfo，入口按当前做法忽略其授权含义，移除此平台字段后进行请求schema校验；任何自报role/OPENID/personId/memberKey仍拒绝。schema本身不会证明身份。

### 5.1 提交实例

前端结构示意，完整可校验载荷见submit.example.json：

```javascript
await cloud.call('submitTalentProfile', {
  requestId: '客户端为这次编辑生成并在重试时复用的唯一编号',
  expectedProfileVersion: 0,
  questionnaireId: 'onboarding',
  questionnaireVersion: '1.0.0',
  catalogId: 'catalog_1.0.0',
  instances: [],
  answers: [/* 本版问卷每个题目及显示状态对应的答案 */],
  consents: {
    noticeVersion: '1.0.0',
    personalAnalysis: true,
    opportunityNotifications: false
  }
});
```

此代码是格式说明，不是可直接提交的有效数据；种子问卷为draft，发布与告知内容完成前服务端必须拒绝。requestId必须符合schema标识规则，不能使用上述中文解释字符串。

首版submitTalentProfile提交当前问卷的完整快照，不是任意局部patch；省略某题不能默认为删除、否或零。后续模块另有问卷时，更新只替换该模块负责的字段，其余模块保留来源；第一版后端只开放onboarding，不跨模块混用完整快照逻辑。

### 5.2 幂等与事务

1. 从可信上下文计算memberKey，读取members与talent_links；active不是true或role异常的已有成员拒绝注册，不能恢复停用账号。
2. 读取指定已发布问卷/字典，验证版本、所有选项、分支、重复卡片、告知版本及条目数量。
3. canonical requestHash包含语义载荷，排除平台userInfo；前后保持数组顺序或按固定规则规范化。相同person+requestId且hash一致返回原提交结果；hash不一致返回CONFLICT。
4. 事务中重新读取成员状态、links、当前画像和授权；先检查幂等记录，再比较expectedProfileVersion。新画像版本为0，已有画像使用服务端返回版本。成员在提交期间被停用也必须拒绝。
5. links.aggregateVersion加1，profileVersion取本次aggregateVersion；版本可能因授权动作跳号，这是预期行为。用受控唯一约束或_id保证首次双请求不会创建两个人。
6. 在同一事务保存members兼容投影、links、submission、profile、各用途consent_events与outbox。所有ID和时间在事务重试前固定生成；事务回调内不调用外部数据库或模型。
7. 新members只能role:member/active:true；已有admin的role不被注册改写。已有记录恢复、提权仍须原有受控流程。
8. 提交成功仅说明本地事务成功，MedTalent异步交付另报状态。数据库跨CloudBase/PostgreSQL不存在这里可假设的分布式事务。

事务SDK调用方式与限制须在wx-server-sdk 4.0.2真实环境复核；离线JSON测试不覆盖事务支持、索引创建或并发行为。

### 5.3 分页

新增列表使用基于(updatedAt,_id)或(generatedAt,_id)的游标，不沿用无限增长的offset。游标由服务端签名或存为不透明分页票据，绑定用户、过滤条件和版本；客户端不能修改任意查询。

数组筛选不宜预先宣称被一个复合索引覆盖。初期有界扫描可以用于小规模候选集，但必须定义扫描上限、是否存在未扫描候选与nextCursor，不能无声丢结果。规模增长后增加拆行的检索投影或MedTalent查询接口，再根据实际查询建索引。

## 6 旧profile兼容与迁移

| members.profile旧字段 | 新来源或处理 | 不允许的推断 |
|---|---|---|
| displayName | 现有称呼可保留；新用户用无身份含义的服务端别名 | 不从姓名推断身份或合并人 |
| stage | current_stage的legacyValue | 不由学位推断已经毕业/在岗 |
| organization | 新增education/work组织选择模块后取标签；未采显示待补充 | 不从学校字符串自动认定学历核验 |
| specialty | 正式专业/岗位字典；未采显示待补充 | 不将当前岗位与所学专业混为同一事实 |
| city | current_city标准代码映射显示标签 | 不将意向城市当现居城市 |
| directions | 职能映射到旧7标签、去重、最多5项，仅供旧UI展示 | other不是完整跨行业职业分类 |
| currentNeed | current_need的legacyValue | 不将探索者强制认定为求职者 |
| experience | 新注册可为空；详细经历在新模块，旧文本仅保留legacy来源 | 不自动解析为已核验能力 |
| shareExperience | share_experience选项投影 | 愿意分享经历≠同意公开资料/企业导出 |

旧consent.opportunityOptIn可作为当前通知偏好展示来源，必须保留旧告知版本。它不是新的人才分析/企业分享授权；旧privacyAccepted不静默升级为新增目的授权。新授权与旧通知展示字段在同一事务更新，但原始授权事件单独保留。

迁移采用逐用户升级：保留members和所有报名关联，创建links并提示用户完成新问卷。旧文本只作为legacy信息待用户确认；没有答案的字段为not_collected_in_version。不可直接从字符串猜学校代码、GPA、技能等级或毕业日期。

必须处理双入口：某成员已进入人才v1后，旧completeOnboarding/updateProfile再写入会覆盖兼容profile。实施时对该用户返回UPGRADE_REQUIRED，转新流程；尚未升级成员暂保留旧路径。identity及活动接口的返回字段继续兼容，新增画像由getMyTalentProfile单独读取。

## 7 与MedTalent数据库交换

交换结构见exchange.schema.json和exchange.example.json。交换包只包含随机personId、数据/映射版本、规范facts、未核验skillClaims与必要授权状态，不含memberKey、OPENID、AppID、手机号或凭据。

| 接入字段 | MedTalent逻辑对象 | 适配要求 |
|---|---|---|
| personId | person的external identity | 使用sourceSystem+personId唯一绑定其person_id |
| question/answers/sourceSubmission | response_session、answer、provenance | 保留原始版本；exchange包的source引用可按授权从采集库审计读取 |
| education重复组facts | education_records | 按instanceId拆行，学位、完成状态与时间分开 |
| experience重复组facts | experience_episode、experience_task | 科研、临床、企业、运营共用主干 |
| skillClaims | skill_assertions及来源关系 | 自述即未核验，不补造evidence URI或概率 |
| target_occupations/industries/work_modes | preferences | 分清职能与行业，保留未知与不愿提供 |
| job投影 | job_posting、job_requirements | 通过ID/版本映射，不按岗位标题当唯一键 |
| consent事件 | consent/processing policy | 同步撤回并阻断后续分析；不得扩张授权用途 |

源码示例中的D2/D3、F02、V1/V2/V3等MedTalent编码并未提供完整字典，因此本包没有臆造映射。正式适配器需要versioned crosswalk：本方conceptId、对方体系、对方代码、版本、关系类型、审核状态。

### 7.1 可靠同步

outbox消费者以服务端身份运行，不允许普通客户端或活动管理员触发任意导出。生产连接参数只在服务端环境或受控密钥管理配置。

消费者采用至少一次交付；接收端以eventId幂等。每个人按aggregateVersion串行交付，不在新事件未处理时并发覆盖旧事件。消费时检查最新授权/删除状态，过期upsert不得越过撤回；profile_upsert载荷profile.personId必须等于顶层personId，profileVersion应与本事件版本相同。授权变化事件profile必须为null。

outbox仅存源记录引用：读取旧事件时按submission与冻结映射重建那一版，不可拿当前profile伪装成旧版本。接收端事务中检查版本、写规范化记录并更新已处理事件后ACK。重复ACK安全，失败按退避重试；超限进入dead并告警。leaseToken/lockedUntil用于崩溃恢复，不能仅靠status永久锁死。

只依赖“接收过更大版本就丢弃旧事件”会丢掉撤回等有意义事件，因此主方案按人有序处理；若未来使用最新状态快照同步，则每个快照必须带完整授权/删除状态并明确事件压缩规则。删除tombstone必须阻止迟到upsert复活资料。

MedTalent不可用时，小程序可保存问卷并显示同步待处理；不伪装匹配成功。岗位投影、字典和匹配结果回流用单独服务身份，先校验来源版本与引用；过期岗位不再推荐，旧画像匹配失效。

### 7.2 岗位与匹配

job requirements拆成must/preferred/unclear，AND/OR保留在requirementLogic；要求节点引用必须存在，不得从岗位名推断年限。salary保留币种、周期、口径与披露/估算来源；平台估算不能标成雇主薪酬。

匹配结果记录met/gap/unknown；未知不是不合格。rankingScore只是排序分，不是录用概率。coverage、sourceFactIndexes、profileVersion及jobSourceVersion用来检查解释是否对应当前事实。源事实索引只对绑定的画像版本有效，过期版本必须丢弃或重算。

## 8 权限 授权与删除

继承现有客户端全拒绝规则，新集合逐个应用；服务端SDK权限不能代替业务鉴权。普通用户所有查询自动绑定本人personId。活动管理员不能用现有admin角色查询其他人的完整人才资料。后台分析/同步另设服务身份与最小权限。

个人分析与机会通知分别选择；通知偏好不等于微信订阅消息发送授权，真正发送还需对应微信平台授权流程。本契约没有企业分享授权功能，也没有企业查询接口。以后增加时需明确接收方、字段范围、用途、到期时间和撤回路径。

setTalentConsent(personal_analysis=false)立即将人才状态置restricted，停止新分析与匹配读取，并创建撤回同步事件；提交新的明确同意后才能恢复，但已进入删除流程的记录不得靠普通提交恢复。opportunity_notifications=false同步关闭兼容opportunityOptIn。已停用账号仍应可撤回或发起删除；不把requireMember统一放在所有权利操作之前。

删除人才资料不等于自动取消活动报名或删除整个社群账号。requestTalentDeletion受理后置deleting，阻断新分析/分享，清除匹配、画像、原始答卷及适用下游数据，按政策处理证据、导出与备份。完成需下游确认，未配置下游时明确不存在待删除副本才能完成。保留必要的最小审计/tombstone有明确期限与目的；不能以“原始层不可变”为由永久保留全部个人答案。

members.profile与registrations中的旧背景/报名快照也属于数据副本。删除人才资料时清理用于人才画像的冗余字段；履行活动服务确需保留的报名信息另有说明和期限，不能不加区分级联删掉活动业务。法律保留例外须由具体处理政策决定，不由schema自行推断。

## 9 实施清单与验收

1. 前后端先共同确认本契约及旧字段映射；schema-only内容可独立审阅，不改现有接口。
2. 依据正式MedTalent字典扩展概念/题库、补正式告知内容，审核后发布版本。当前11题为结构种子，不能称完整人才评估。
3. 余同学负责新增集合、索引、服务端事务与校验、同步适配器；书玉负责选择题组件、无默认值、分支、重复卡片、版本冲突和缺失选项。沿用仓库已有分工。
4. 后端先实现getTalentQuestionnaire、submitTalentProfile、getMyTalentProfile、setTalentConsent与删除流程，再接MedTalent同步；岗位和匹配页面后续按同一契约接入。
5. 实施旧入口升级保护，保证活动、报名和管理员逻辑回归通过。
6. 使用合成记录验证：伪造身份/role拒绝，非法选项拒绝，隐藏题拒绝，重复提交幂等，相同requestId不同载荷冲突，并发两个版本只能一个成功，停用时拒绝注册但仍可撤回/删除。
7. 同步故障验证：中途失败重试、重复事件、旧upsert晚于撤回、删除后迟到消息、不支持的字典版本、下游长期不可用。删除不能先显示完成再等待下游。
8. 在测试云环境做客户端直读写拒绝、两个真实微信账号隔离、依赖/事务兼容和开发者工具页面检查。合成数据全部通过后再试采真实人才资料。

本次离线验证范围：JSON Schema元校验、种子/提交/画像与交换示例、非法身份字段、单多选、互斥、版本、缺失、分支及重复教育组。未进行真实云端部署、身份验证、数据库迁移、同步或匹配质量评估。

## 10 技术依据

- [CloudBase微信云函数与可信身份](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)
- [CloudBase数据库安全规则](https://docs.cloudbase.net/database/security-rules)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)

以上用于核对身份链路、规则与schema规范；不据此声称当前云环境已配置。现有wx-server-sdk依赖保持仓库版本，不因示例文档版本不同而随意升级或降级。
