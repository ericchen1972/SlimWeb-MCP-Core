# SlimWeb 能力地圖與商家需求對照

盤點日期：2026-11-11。依 Merchant MCP 實際 tools/list、Webless 應用服務與前台結帳邏輯核對。這是功能導覽，不是本站已啟用、交易成功或所有部署皆提供的保證。

## 即時操作指南

每個新任務先呼叫唯讀 `slimweb_guides_get`（`topic: index`），再讀取 `overview` 與相關主題。工具回傳部署中的 `guide_version`、主題及內容雜湊；指南只包含通用操作文件，不讀取網站資料、不需要選站，也不授予任何站台操作權限。網站資料與寫入仍依目前登入、site_code、權限、工具 schema 及人工確認規則。指南讀取失敗時停止寫入、說明原因並在連線恢復後重試，不以舊本機文件替代。

## 使用方式與能力狀態

先理解商家的目的，再找原生功能與可組合方案。不要要求商家先講出後台名稱或工具名稱。先讀本指南相關列，再讀當前工具 schema 和本站資料；不必每次載入整份工具清單。

- **原生可做**：功能及必要欄位出現在 current tools/list，且本站資料符合條件。
- **組合可做**：可用多個現有功能達成目的；說明與原需求的差異，取得對差異的接受後執行。
- **需要設定**：功能存在，但憑證、權限、商品資料、SMTP 或商家通路尚未就緒。
- **後台可做／連線未開放**：Web Admin 有此功能，當前 MCP 未開放（not exposed）；提供後台路徑，不宣稱整個平台沒有。
- **尚待確認**：工具清單、schema、權限或部署資訊不足；說明缺少哪個證據，不猜測。
- **目前不支援該精確規則**：完成下面查核後，指出具體缺口及最接近的現有方案。不要以功能名稱不同作為拒絕理由。

HTTP MCP Client 先 initialize，再送不含 id 的 notifications/initialized；有效通知回 HTTP 202 且本文為空，不把空本文當 JSON 解析，也不把 HTTP 200 一律當 JSON-RPC 成功。收到錯誤物件時檢查 error.code／message。初始化成功不代表商家已登入，工具仍受原有驗證及權限限制。

指南中的工具名稱是候選路線。SaaS、Standalone、版本、權限及 capability profile 可有不同 tools/list；未列出的工具不能呼叫。所有站台操作沿用 server 的選站、site_code、權限與確認規則。

## 能力地圖

| 領域／功能 | 能幫商家做什麼／先查哪裡 | 重要邊界 |
| --- | --- | --- |
| 即時操作指南 | slimweb_guides_get：index 列出主題，overview 與其他 topic 讀取目前部署版本的操作文件 | 唯讀通用指南，不是網站資料或權限授予；讀取失敗停止寫入並重試 |
| 開站進度與健檢 | launch_progress、readiness、settings：找出產品、付款、物流、內容、郵件等缺項 | 完成設定不代表第三方已驗收；新手才循序開店，不打斷既有任務 |
| 網站基本資料、Logo、聯絡資訊 | settings、contact_settings：站名、狀態、網站類型、國別、商品載入方式、退貨天數、分類顯示、Logo、社群及地址電話 | 改站名不會改網址；Logo 與素材庫不同；聯絡欄位不自動變成任意 Theme 按鈕 |
| 商品分類與一般導覽 | categories、nav_items：多層分類、圖示、分類圖、選單與連結 | 兩棵樹獨立；商品放葉節點；有商品的分類不可新增子分類；不自動建立另一棵樹 |
| 商品與規格庫存 | products list/get/upsert：售價、特價與期限、成本、庫存、限購、上下架、規格、圖片影片、服務商品 | 先讀完整商品；規格和數量優惠陣列會重建，省略可能清空；保留既有 variants、quantity_discounts、videos。不要藉修改商品來偷偷改促銷條件 |
| 批次商品匯入 | products_import inspect → mapping → validate → 確認後 commit：CSV、XLSX、SQL 匯入來源 | 必須檢查欄位、規格、分類、圖片及驗證結果；SQL 檔解析不是任意 SQL 執行 |
| 數量優惠／數量折扣 | products_get 的 quantity_discounts；products_upsert 寫 quantity、discount_percent | 目前寫入需 variant_mode=different_price；按購物車單一品項數量選最高命中門檻，整行按百分比折抵。不同規格／商品不自動合併，沒有每 N 件送 M 件的循環引擎 |
| 優惠券 | coupon_templates list/upsert；members_coupons_issue/revoke：固定金額券、手動、全會員、消費滿額送券、生日券、商品搭配券 | issue_trigger 決定發放方式。消費滿額送券不是當筆直接折價；product_bundle 是商品送券，不是任選組合價。非生日需日期；生日沿系統效期；manual issue 只給手動券 |
| 折扣碼 | discount_codes：結帳輸入代碼取得比例折抵、來源平台與使用成效 | 不憑空加入日期、分類限定、次數或首購欄位；以當前 schema 為準；平台欄位不代表已投放廣告 |
| 會員與會員等級 | members list/get、member_tiers：會員查詢、消費紀錄、累積消費門檻與等級折抵 | 累積消費不是當筆門檻；取最高已達等級，包含 0 折抵，不回退低級優惠；確認升級時點與折抵單位；編輯時帶回既有完整 min_spend／discount_percent（省略會套 0／1.0 預設，不是保留）；不推論有點數、儲值或付費訂閱引擎 |
| 加購商品／單品加購 | product_add_ons list/upsert：買 A 可以優惠價加購 B，設定 max_quantity、排序、啟停 | A、B 必須不同且都是非服務商品；加購價可為 0，但必須低於 B 目前單買有效價。商品層級關聯，不是規格專屬、全站任選或自動送贈品；加購仍需選取，不再套自身數量優惠；受主商品父行各自的額度、共用庫存與上限限制 |
| 滿額贈禮／滿額禮 | threshold_gifts list/upsert：達金額門檻送指定商品，設定門檻、排序與啟停 | 贈品需本站 is_service=true 的服務商品；不擅自轉換現有實體商品。依商品小計扣除數量優惠、會員等級、優惠券及折扣碼後且不含運費的金額，選最高符合門檻的一份，寫入零元訂單品項；不累贈、不按件數、不當成實體贈品庫存管理 |
| 付款與物流 | payment_logistics get/update：ECPay、NewebPay、PayNow、LINE Pay、轉帳匯款；綠界／藍新／PayNow／HCT 物流 | 以 get 回傳的支援通路與訂單 available_actions 為準；常溫、冷藏、冷凍、取貨或取貨付款各別確認。主線上金流切換需明確要求；activation_deferred 是儲存待啟用 |
| 運費與滿額免運 | Web Admin 的運費設定：國內／海外費用與各自免運門檻 | 網站已有，盤點的 Merchant MCP 沒有運費寫入欄位；不要發明 shipping 工具或塞進 settings_update。免運門檻基準同為商品小計扣數量優惠後、會員等級折抵前且不含運費；門檻 0 不是自動免運，零運費與正數免運門檻含義不同 |
| 購物車、結帳與會員購買 | 原生 storefront；LINE 提供各自授權的查商品、購物車及訂單流程 | Merchant MCP 管店，不冒充消費者下單。前台重驗價格、規格、庫存、限購及促銷，歷史訂單保留快照；LINE 加車不等於建立或付款訂單 |
| 訂單查詢與履約 | orders list/get、狀態／收件人更新、建立物流、手動出貨、列印託運單 URL | 僅對 available_actions 提供的供應商／通路執行；出貨標記不是建立寄件單。狀態／收件人／刪單需本次指令完整訂單號；讀取列印可用查詢結果，工具不控制印表機 |
| 退貨與退款 | returns_pending、逆物流、取消／完成退貨、refunds create/complete | 目前退貨為整單；逆物流與線上退款依 available_actions。手動記錄退款不是實際匯款；未知 unknown 結果先對帳，不重複建單 |
| 電子發票 | invoice_settings、invoices list/get/create/issue/sync/void/allowance：訂單或獨立交易草稿、開立、作廢、折讓 | ECPay／ezPay 與金流憑證分開；草稿不等於開立；目前台幣含稅一般應稅 5%。財務操作依明確確認與穩定 key；折讓須買方同意；自動開立只作用於啟用後合格事件，未知結果先 sync |
| Theme 與全站風格 | themes、theme_shell、theme_style_profile、design_context、site_theme_mode：導覽列、浮動按鈕、頁尾、root CSS、設計摘要 | Theme 與頁面內文分開；Default 不可寫 root；啟用需明確要求；保留 runtime slots、Tailwind、響應式與覆蓋層驗證 |
| 首頁與自訂頁面 | pages list/check_title/get_content/create/update/delete、preview：首頁、品牌頁、活動頁、FAQ、政策說明 | index 與自訂頁可編輯；其餘固定系統頁不可任意改內文／刪除。活動頁文案不會啟用折扣；JS 與 enabled_libraries 依工具規則 |
| 文章與 Notion 匯入 | articles、notion_pages_search／page_get_content：寫文章、搜尋授權內容、建立或更新匯入文章 | 文章與頁面不同；標題消歧義、16:9 封面、讀取現況；Notion 必須授權，匯入不是無限制自動同步 |
| SEO／AEO／GEO 與追蹤 | seo_settings：全站搜尋／社群預覽、llms、GA；content_seo_update：頁面／文章創作流程的內容 metadata | 不保證排名／收錄；內容 SEO 不可獨立呼叫；不編造評論、評分或商家事實。Facebook 設定可管 App/Page/comments，不代表廣告或發文 API |
| 素材上傳、圖片與海報 | uploads create → PUT → commit、attachment import、assets、product_image_reference、posters | 客戶端生圖與後端海報不同；後端海報需本站 AI。先有真實素材；不可發明 URL／附件路徑；海報不能自創價格、折扣或期限 |
| 素材空間清理 | media_library_stats／delete_unused、external_assets list/delete | 未使用需刪除前即時重查；不強刪被引用素材；external assets 清理不代表任意 CDN 腳本可注入 |
| SMTP 與交易通知 | mail_delivery_settings、mail_templates、mail_layout：郵件伺服器、五種買家事件內容、共用外框 | 五種事件：order_created、order_shipped、store_arrived、return_requested、return_logistics。保留 {content} 等 placeholders；設定不是寄送成功。AI 行銷開關與間隔只是設定，不代表自動行銷寄送已實作 |
| 會員個別事務信 | member_email_preview → 使用者核准預覽 → member_email_send | 非行銷用途；To/CC/BCC 合計去重最多五個位址；同步寄送、不建立電子報。不可拿來繞過電子報收件限制 |
| 電子報與活動信 | newsletters create/list/get/update/delete：外部 AI 編 HTML、設定 scheduled_at、管理排程 | 寄送當下所有有效會員，沒有指定名單；建立不等於寄出。SaaS 需完整 SMTP；Standalone 依部署 mailer；檢查排程器，不把 AI 行銷設定當作排程引擎 |
| AI 客服與服務紀錄 | customer_service settings/logs：客服提示、啟用、問答額度、保存天數與紀錄查閱／刪除 | 客戶端 MCP 內容編修不需本站 AI；客服、LINE AI、後端海報需本站供應商。AI provider/key/models 在 Web Admin → AI 管理 → AI 串接，當前無專用 Merchant MCP 寫入工具；不索取或回顯秘密 |
| LINE Bot 與 LINE AI | line_bot_settings、line_ai_settings、line_bot_qrcode：Bot 憑證狀態、啟用、提示與保留天數、加好友 QR | 一般公開問答不需會員綁定；會員訂單／購物車需驗證綁定。QR 不代表 webhook 或 AI 已可用；對話歷史可在後台查，Merchant MCP 無 LINE 歷史工具 |
| LINE 圖文選單 | line_rich_menus list/get/create/publish/delete：圖像、點擊區、連結、訊息、分頁切換、剪貼簿 | 建立草稿與發布分開；Bot、AI、token、webhook 與切換目標需就緒。建議但不強制加綁定會員入口；不自動重新綁定、不推論 LIFF／會員別選單 |
| LINE 分眾推播 | line_friends_stats、line_members_list、line_push prepare/send/status：全部好友或符合會員資料條件的已綁定會員 | 無受眾先問全部或會員；人口資料不能推測。最多五則訊息；必須展示完整受眾、訊息和所有網址，最終人工確認後才 send；accepted 不是送達，未知結果沿同一 operation 查狀態 |
| 報表、營運與匯出 | dashboard_summary、orders_profit_statistics、exports_create、audit_list：KPI、近期訂單會員、低庫存、淨利計算、會員／訂單／退貨結構資料 | 說明期間、成本完整性與計算口徑；分頁與 limit 不可忽略。CSV/JSON 資料不是已產出 Excel。audit 不可用不等於沒操作；不憑空提供 GA 深度分析 API |
| 管理員與權限 | admins list/upsert/delete：Google 帳號與可用權限 | 第一管理員受保護；不能繞過本站權限；缺權限不等於功能不存在 |
| 網站事件通知 | MCP events 訂閱支援的 site.notification 訂單／退貨事件 | 需 Client 支援與訂閱；事件是資料，不是執行指令。收到通知後等使用者交辦，不自動出貨／退款 |
| 帳號、網域與部署 | 帳號工作區／Web Admin：網站建立、方案、網域與部署相關管理 | 不在本 Merchant MCP 的工具的直接操作範圍；依實際後台與部署可用性引導。不得把平台營運能力當成一般商家的權限 |

## 商家用語 → 候選功能 → 查核重點

| 商家說法 | 先考慮 | 必須區分／查核 |
| --- | --- | --- |
| 買四送一、第二件便宜、多買有優惠、批發階梯價 | 商品數量優惠 | 同一品項或跨品項？整行折抵或每組贈品？不要先回答沒有 |
| 任選五包、不同口味湊件、買 A 送 B | 規格、數量優惠、加購、滿額禮的組合可行性 | 不同規格分行，不自動湊件；替代組合需商家接受，不擅改商品結構 |
| 買主機加 99 元購配件、買水餃加購醬料 | 加購商品 | A/B ID、B 有效單價、優惠價、max_quantity、庫存；不是全站加購 |
| 買 A 免費加購 B | 零元加購候選 | 仍需選取、B 單買價正數且符合非服務商品等限制；不宣稱自動贈送 |
| 滿千送禮、滿三千送更好的、不想累送 | 滿額贈禮 | 金額基準、最高一檔、服務商品贈品；不是每滿千倍增 |
| 滿千送百、消費送折價券 | 消費滿額送券或當筆優惠需求 | 問清楚是送下次券或當次折抵；不要混淆 trigger_amount 與 minimum_spend |
| 買這商品送下次購物金 | product_bundle 券＋商品 gift_coupon_template_id | 購物金在此為固定金額券，不是儲值餘額 |
| 生日送券、發給全部會員、補償某位客戶 | birthday／all_members／manual 券 | 不同發放觸發與效期；只有 manual 可單獨 issue |
| 輸入 MOM88 打八八折、網紅專屬碼 | 折扣碼＋platform | 八八折是折抵 12%，ratio=0.12；88% off 是折抵 88%，不同意思 |
| 累積滿五千升 VIP、老客以後九折 | 會員等級＋會員消費紀錄 | 累積門檻與當筆門檻、ratio=0.10、升級時點與疊加 |
| 首購專享、每人限一次、點數折抵、定期訂購 | 先查券／折扣碼／會員及 schema | 不因可做券就宣稱有首購條件、限用次數、點數或週期扣款 |
| 滿額免運、離島海外運費、免運活動 | 原生運費設定 | 國內／海外規則；當前 MCP 未開放運費寫入，導引後台 |
| 冷凍超取、黑貓宅配、超商付款、收現金或匯款 | payment_logistics | 供應商、溫層、通路、合約、測試／正式、收款與配送是不同能力 |
| 列印未出貨訂單、寄件、貨到了嗎 | orders list/get、waybill、create_logistics | 託運 URL 不等於已寄出；狀態查詢能力依 carrier；未知結果不另建 |
| 退一件、退款、退貨標籤 | returns／refunds＋available_actions | 整單退貨限制、人工退款紀錄與線上退款；不默認可部分退貨 |
| 幫我開發票、補開、作廢或折讓 | 發票草稿與生命週期 | 草稿／開立、買方同意、環境及未知結果；不把退款等同折讓授權 |
| 換全站風格、改頁尾、只改首頁、做活動頁 | Theme 或 page | 先分全站 shell 與內文；活動頁不會自動建立促銷規則 |
| 做分類、放到選單、關於我們連結 | categories 或 nav_items／pages | 分類與選單獨立；不擅自同步 |
| Excel 搬商品、照片規格一起匯入 | product import | inspect／mapping／validate／確認 commit；不執行 SQL |
| 寫文章、搬 Notion、讓 Google／AI 找到 | articles／Notion／SEO | 授權、封面、內容 metadata 與全站 SEO 分開；不保證收錄 |
| 畫優惠海報、用原商品照片、做圖文選單背景 | posters／圖片工具／uploads | 站台 AI 或客戶端生圖、素材可用性；圖像不啟用活動 |
| 改出貨通知、換全部信件外框、通知某位會員 | event template／shared layout／operational email | 明確區分內容、外框、實際發送；事務信不能用作促銷名單繞道 |
| 週末寄促銷、只寄高消費客戶、AI 每週自動寄 | newsletter／會員查詢／AI 行銷設定 | newsletter 是全有效會員；指定行銷名單與自動 AI 行銷工作流不可假裝支援 |
| LINE 自動回覆、加入好友、做選單 | LINE Bot／AI／QR／Rich Menu | 公開問答與綁定私有資料不同；QR、驗證、回覆、發布分階段驗證 |
| LINE 推給全部粉絲、台北生日會員 | LINE 推播與會員篩選 | all broadcast 或 bound-member multicast；先預覽確認，人口資料缺失不猜 |
| LINE 再買一次 | LINE reorder | 身分和授權、加入購物車與結帳付款分開；不拿 Merchant MCP 代客操作 |
| 賺多少、缺貨有哪些、下載會員訂單 | KPI／profit statistics／exports | 計算期間與成本、分頁與截斷；不要把報表稱為會計帳或已建立檔案 |
| 沒有設 AI Key 還能改站嗎 | 外部 AI Client＋Merchant MCP | 一般內容工具可用；後端海報、客服與 LINE AI 才需要本站 AI；Key 設定引導後台 |

## 判定不支援前的查核規則

1. **翻譯需求**：辨識目標、觸發條件（金額／件數／商品／累積消費／生日／日期）、適用對象、獎勵、是否自動、是否需實際寄送或交易。只問會改變機制的缺項。
2. **找候選功能**：先對照能力地圖與商家用語；至少考慮直接原生機制和合理的功能組合，不能只搜使用者原字句或只找同名工具。
3. **查當前連線**：確認 current tools/list／schema／選站／權限／部署 profile。工具未出現在目前連線、認證失效、參數錯誤、欄位尚未設定與整個 SlimWeb 不支援是不同結論。
4. **讀本站現況**：使用對應 list/get；核對既有商品、規格、促銷、金流、會員與啟用狀態。不能因尚未設定就判定沒有功能，也不能因有設定就宣稱已生效。
5. **核對精確語意**：範圍、金額基準、百分比單位、四捨五入、門檻、疊加、日期、最高一檔或累贈、規格與庫存、草稿／啟用／已送出。schema 沒有的欄位不可捏造；不靠前台 JS 改價或文案假裝後端規則成立。
6. **測試代表案例**：促銷至少門檻前、剛好門檻、門檻後、倍數與不同規格／混購。例：單價 100，五件折抵 20%，5、6、10 件是 400、480、800；每五件免費一件則為 400、500、800。headline 相同不代表所有數量等價。用唯讀計算／預覽檢查，不為了驗證擅自建立真實交易或寄送訊息。
7. **給出分級答案**：說「可以用 X，條件是…」「可用 X＋Y，差異是…」「網站已有，這個連線未開放，可到後台…」「目前缺憑證／權限，完成後可用」；資訊不足說待確認。只有查核後才說「目前不支援這個精確條件」，附具體缺口、已查來源與可接受替代方案。無需把整段查核過程倒給商家。
8. **確認執行與結果**：只有問可否或要建議時，先回答方案，不擅自啟用。授權修改後依個別工具的確認、預覽、冪等與回讀規則操作；說清楚設定已儲存、已啟用、API accepted、實際送達／實際交易的差別。未知 unknown 結果先查狀態，不用新操作重試。

### 金額與寫入注意

- 數量優惠 discount_percent 用整數折抵百分比，20=折抵20%=八折；折扣碼／會員等級用折抵比例，0.20=八折、0.10=九折。同名欄位不能混用，也不是應付比例。更新前仍核對部署實際 schema 與讀回值。
- 商品 MCP 會重建規格、數量優惠及影片陣列。先 products_get，保留現有陣列（videos 由讀取物件轉為 URL 字串）、規格順序／預設規格與其必要欄位，再只調整已授權部分；確認後回讀。不要為加數量優惠擅自切換模式或新增規格。
- 買四送一可先評估五件八折的價格方案，但不自動加贈品、不保證六件或混購等價；須說明規格模式及單行門檻限制。
- 加購商品是依附主商品的可選購買；滿額贈禮是金額達標的零元贈品快照；兩者皆不是完整跨商品任選／循環贈品引擎。

## 結帳疊加與部署差異

### 數量優惠、加購與會員等級

- 數量優惠只套一般商品／規格行，以該行數量選最高命中門檻，整行折抵四捨五入為整數且不超過該行小計。不同規格／商品不合併湊件，沒有每 N 件循環送 M 件的引擎。
- 加購行以目前有效關聯的 add_on_price 計價，不再套加購商品自身的一般數量優惠；會員等級折抵則以一般商品扣數量優惠後加上加購金額的合計為基準。加購仍需選取，不是自動贈送。
- 使用累積消費已達的最高會員等級（同門檻依較新等級 ID），包含折抵比例為 0 的等級；不退回較低等級取得非零折扣。0 是不折抵、0.10 是折抵 10%、1.0 是折抵 100%。下單時從鎖定會員資料重新判定，不拿舊顯示等級當依據。
- 加購必須依附同車的一般商品，不能孤立、自加購或巢狀加購。max_quantity × 該行主商品數量，是「同一主商品購物車行（含該主商品規格）」下、同一加購商品的合計上限；只在這個父行內合計加購商品各規格的數量。不同主商品行各算各的，不能把其他父行沒用完的額度移過來，即使主商品 ID 相同也一樣。相同 SKU 的庫存仍跨所有一般與加購行合併檢查，不能把「每父行的加購額度」誤解成「各行擁有獨立庫存」。需要規格的商品必須選取有效規格，不能以未選規格的基礎價格下單。
- 例：咖啡機每台最多加購 2 包濾紙。黑機 1 台、白機 1 台分成兩個主商品規格行，各行最多掛 2 包，不能將 4 包全掛黑機行；若只買黑機 1 台，該行下同一濾紙商品的 A／B 規格合計最多 2 包，不能各買 2 包。若同一黑機行數量為 2 台，該行才可合計加購 4 包。
- 同一 SKU 可同時一般購買及依附不同主商品加購；這些行的身份包含主商品、商品與規格，歷史／重新購買不能互相覆蓋。重新購買以目前價、規則和庫存重驗，不照搬歷史成交價；加購行不帶一般數量優惠。重複的相同行身份／明確 key 會被拒絕，不能拆行繞過檢查。

### 報價、訂單與驗證邊界

修復後原生購物車與結帳使用唯讀伺服器報價，與下單共用金額計算；以目前資料庫的價格、規格、優惠、會員、運費及贈品判定為準。瀏覽器舊價格、手算、活動頁及頁面 preview 都不是正式報價。報價不保留庫存、不使用優惠券、不建立訂單；下單仍再次驗證。報價尚未完成或失敗時不送單，失效品項仍可移除。超商取貨以台灣目的地及選定門市處理，國內／海外運費仍依網站設定的國別基準判定，不擅自把超商取貨解讀成全站免運。

原生 storefront `cart/state operation=quote` 與 LINE 購物車報價已共用 `StorefrontPricing`。這不新增 Merchant MCP quote 工具；各介面的身份與操作權限仍分開，不能用商家權限冒用消費者。先讀目前 tools/list，依實際連線選工具，不發明同名工具。以下是已覆蓋程式路徑與本機驗證邊界，不宣稱正式部署、真實 LINE、付款或出貨驗收已完成。

### LINE quote tools and limits


- `App\Services\StorefrontPricing` is the current authority for cart identities, available variants, shared SKU stock, per-parent add-on caps, current sale price, normal-line quantity reductions, highest attained member tier, owned coupon/code stacking, country shipping and threshold gift. Native cart/checkout/order, LINE quotes use it; cached browser/cart/event prices are never payable totals.
- LINE `cart_view` and post-mutation/reorder results include a refreshed `quote`. `cart_quote` is read-only and accepts hypothetical `member_coupon_id`, `discount_code`, `recipient_country`, `pickup`, `storefront_payment_method`; it does not save choices. `cart_promotions_options` returns scoped owned currently issued coupon IDs and actual enabled `checkout_choices`. `cart_promotions_set` saves only explicit customer selections for the current site/member/binding, after validation. Null coupon/empty code clear the respective selection; cart clear removes saved selections.
- `product_details.add_ons` exposes current active available add-on targets/rules/variants. `cart_add.parent_cart_item_key` is required for an explicitly selected add-on. Existing exact-key add-on quantities can be changed; combined target variants share that parent's cap and all lines share SKU stock. Repair/removal remains possible when a promotion or line becomes invalid. Failed pricing returns actionable errors and safe identity/quantity data without stale prices.
- LINE amount validity is `pricing_status=ok|invalid`; `checkout_status=payment_selection_required|pending_store_selection|ready` and `provider_limits` separately describe payment/logistics readiness. An unsupported pickup choice is rejected, not saved; enabled pickup is TW and still needs native store selection. Actual provider limits are checked through native checkout choices. A quote is not acceptance by a payment/logistics provider.
- LINE selections use a two-hour site/member/binding cache and a five-minute single-use entry-grant snapshot. Browser transfer writes `storefront_cart_promotion_selection.{site}` plus `storefront_cart_promotion_owner.{site}`. Native cart discards missing/mismatched owners; logout clears both. Browser checkout revalidates all prices and selections. Bot binding revocation prevents grant exchange and personalized cart access.
- Local regression tests cover these paths; this change alone does not establish production deployment, real LINE replies, real payment acceptance or a real shipment.


同一網站、同一會員／訪客身份與同一 checkout_token 的重送會回原訂單；付款重試沿用原訂單，不再次扣庫存或兌券。建單失敗時，該訂單交易內的庫存、券與訂單一起回滾。另一次不同提交仍是新交易，不宣稱任意重複購買都會自動去重；舊訂單保留原始金額快照。

算例（假設所有規則、券及碼有效）：一般商品 2×100，2 件折抵 10% 得 180；加購 2×50 得 100，不再套其自身 20% 數量優惠；最高會員等級折抵 0，即使低一級為 0.10，合計仍 280。扣 20 元券後 260，碼折抵 0.10 得 26，商品應付 234，加運費 60 總計 294。250 元滿額贈不成立；不能用含運費 294 判定。

修復後的結帳由伺服器依本站、目前登入會員與資料庫現況重新核對，不採信購物車傳入的折抵金額。商品折抵順序為：數量優惠 → 會員等級 → 已發放優惠券固定金額 → 折扣碼對剩餘商品金額按比例折抵。優惠券最低消費以數量優惠及會員等級折抵後、優惠券及折扣碼折抵前且不含運費的商品金額判斷；券額不超過該金額，折扣碼折抵四捨五入為整數並不超過餘額，商品應付最低為零。代碼去除頭尾空白、在本站不分大小寫比對，不推論 schema 沒有的日期或次數限制。

兌換須為本站、目前會員的 issued 券，符合已發放券 starts_at／expires_at，且沒有 used_at、used_order_id、revoked_at；目前模板須存在且固定折抵額大於零。以已發放券效期為準，修改模板不會取代已發放券的到期日。失效或未達門檻會拒絕下單，不能以購物車顯示代替驗證。券與 used_order_id 在同一訂單交易內標記使用；建單失敗一起回滾。同一提交重送回原訂單，付款重試也沿用原訂單，不再次兌券。

滿額贈禮改以四種折抵後、不含運費的商品應付金額判斷，只取最高符合門檻的一份服務商品贈品。運費／免運仍以數量優惠後、會員等級／券／碼前的商品金額計算。零元總額也必須先通過原生付款／物流通路的金額驗證，物流通路的上下限不因折抵至零而略過。例如黑貓最低 30 元、綠界冷凍超取最低 1 元、PayNow 依實際通路最低 1 或 30 元，因此這些通路會先拒絕零元。只有通過所有通路驗證且總額為零的訂單，才以 fully_discounted 記為已付款並略過外部金流；不要將免付款解讀為免物流限制。

以上描述修復後實作，不代表正式站已部署或交易驗收成功。舊 SaaS／Standalone 部署可能不同；承諾活動前須確認目標版本與結帳結果。工具設定成功及購物車呈現都不是最終訂單折抵的證據，也不為測試提案擅自建立真實交易。

## 維護與證據

來源：SlimWeb-MCP-Core src/app.js、src/lineTools.js、src/invoiceTools.js 的實際工具；Webless app/Services/Mcp/Catalog/ProductService.php、Commerce/MemberPromotionService.php、Commerce/MerchandisingService.php、Commerce/CommerceSettingsService.php、StorefrontController.php；PROJECT_MAP、AI_PAGE_REFERENCE、商品／優惠／後台 maps。靜態指南不是正式環境驗收報告。新增功能或改 schema／計算方式時，同步更新能力列、用語列、MCP 指引與完整工具索引，再測情境。

## 完整 Merchant MCP 工具索引

以下是本次盤點的完整工具集合。實際可呼叫項目仍以當前連線 tools/list 為準；索引不授予權限，不代表 Standalone 全數開放。


- `slimweb_invoice_settings_get` — Read electronic invoice connection settings.
- `slimweb_invoice_settings_update` — Update the separate electronic invoice provider connection.
- `slimweb_invoices_list` — List invoices in the selected site.
- `slimweb_invoices_get` — Get an invoice snapshot and status, without provider credentials..
- `slimweb_invoices_create` — Create a reviewable invoice draft; never issues a tax invoice.
- `slimweb_invoices_issue` — Issue this reviewed draft with its original provider/environment.
- `slimweb_invoices_sync` — Query the original provider to reconcile invoice status after pending/unknown results.
- `slimweb_invoices_void` — Void this issued invoice with an explicit reason and user intent.
- `slimweb_invoices_allowance` — Create an allowance for this invoice with explicit user intent and reason.
- `slimweb_line_bot_settings_get` — Read LINE Bot settings and readiness.
- `slimweb_line_bot_settings_update` — Partially update LINE Bot settings.
- `slimweb_line_ai_settings_get` — Read LINE AI prompt and retention settings, without conversation history..
- `slimweb_line_ai_settings_update` — Partially update LINE AI prompt and conversation retention days.
- `slimweb_line_rich_menus_list` — List managed LINE Rich Menus and their readiness, without conversation history..
- `slimweb_line_rich_menus_get` — Inspect a managed LINE Rich Menu, image, areas, readiness and warnings before publishing..
- `slimweb_line_rich_menus_create` — Create an unpublished LINE Rich Menu from a committed site media_path.
- `slimweb_line_rich_menus_publish` — Publish the inspected menu as the Bot default.
- `slimweb_line_rich_menus_delete` — Delete this managed LINE Rich Menu.
- `slimweb_line_bot_qrcode_get` — Get or generate the configured LINE Bot add-friend QR code as a committed site PNG asset.
- `slimweb_line_friends_stats` — Read dated LINE friend statistics plus bound/eligible member counts.
- `slimweb_line_members_list` — Search/count eligible active website members bound to this Bot, excluding unfollow.
- `slimweb_line_push_prepare` — Prepare only; never sends.
- `slimweb_line_push_send` — Send the immutable prepared preview ONLY after explicit final human confirmation of recipients, message content and every hyperlink.
- `slimweb_line_push_status` — Inspect prepared push preview and batch submission status.
- `slimweb_media_library_stats` — Return media-library total count and size plus unused count and size.
- `slimweb_media_library_delete_unused` — Delete only committed media assets that are unused.
- `slimweb_orders_get_waybill_url` — Return a printable forward-logistics waybill URL for one or more selected orders.
- `slimweb_returns_get_waybill_url` — Return a printable return-logistics waybill URL for selected return orders.
- `slimweb_orders_update_status` — Update top-level order status.
- `slimweb_orders_update_recipient` — Update recipient names for explicitly named orders.
- `slimweb_orders_delete` — Permanently delete orders only when the current user instruction explicitly supplies every complete order number.
- `slimweb_notion_pages_search` — Search Notion pages authorized for the configured integration by title.
- `slimweb_notion_page_get_content` — Read one authorized Notion page as safe HTML without importing it.
- `slimweb_external_assets_list` — List external CSS or JavaScript assets configured for pages and themes..
- `slimweb_external_assets_delete` — Delete one external page or theme asset by stable asset_id..
- `slimweb_articles_delete` — Delete one article by stable article_id, using the same site scope as Web admin..
- `slimweb_members_delete` — Delete one storefront member by stable member_id..
- `slimweb_members_coupons_revoke` — Revoke one issued member coupon.
- `slimweb_newsletters_list` — List existing newsletter records so the AI can select a stable newsletter_id..
- `slimweb_newsletters_get` — Read one existing newsletter.
- `slimweb_newsletters_update` — Patch one existing all-member newsletter.
- `slimweb_newsletters_delete` — Delete one existing newsletter by stable newsletter_id..
- `slimweb_discount_codes_delete` — Delete one discount code by stable discount_code_id..
- `slimweb_member_tiers_delete` — Delete one member tier by stable member_tier_id..
- `slimweb_threshold_gifts_delete` — Delete one threshold gift rule by stable threshold_gift_id..
- `slimweb_product_add_ons_delete` — Delete one product add-on rule by stable product_add_on_id..
- `slimweb_customer_service_logs_delete` — Delete one AI customer-service log by stable customer_service_log_id..
- `slimweb_auth_status` — Return the authenticated SlimWeb MCP account status..
- `slimweb_sites_list` — List SlimWeb sites available to the authenticated account.
- `slimweb_site_select` — Validate and return a SlimWeb site selected from slimweb_sites_list.
- `slimweb_themes_list` — List custom page style schemes/themes for a SlimWeb site.
- `slimweb_site_theme_mode_get` — Read the site-level storefront color mode.
- `slimweb_design_context_get` — Return the active storefront visual design context before any page design, theme design, illustration, or drawing work.
- `slimweb_site_theme_mode_update` — Update the site-level storefront color mode to light or dark.
- `slimweb_themes_create_from_default` — Create a new non-Default theme/page style scheme.
- `slimweb_themes_create_from_theme` — Create a new inactive theme by cloning the shell, root assets, and style profile of an explicit non-Default source Theme.
- `slimweb_themes_activate` — Set a theme/page style scheme as the active storefront theme after user confirmation.
- `slimweb_themes_delete` — Delete a non-Default theme/page style scheme and its stored template contents.
- `slimweb_theme_shell_get_context` — Return reference-only JSON describing the fixed navbar, floating_actions, and footer theme slots, real storefront shell data, the mandatory primary-navigation, member-auth, and cart presentation slots, current category navigation mode, both runtime states, canonical CSS hooks, factual website_type context, and the current MCP-managed root CSS.
- `slimweb_themes_update_root_elements` — Update the fixed navbar, floating_actions, and footer root fragments plus theme-level CSS.
- `slimweb_theme_style_profile_get` — Read the editable style summary/profile for a theme so visual design can stay consistent with prior user requests..
- `slimweb_theme_style_profile_upsert` — Create or update a theme style summary/profile with user intent, visual keywords, color, typography, layout, illustration, and avoid notes..
- `slimweb_theme_style_profile_append_request` — Append one user request/change note to a theme style profile history without replacing the existing profile..
- `slimweb_site_readiness_get` — Read a site readiness report listing incomplete or missing setup areas so AI can proactively tell the user what still needs to be configured..
- `slimweb_site_launch_progress_get` — Read launch progress from blank ecommerce site to go-live, grouped into required setup, recommended improvements, growth tasks, and the next user-friendly action..
- `slimweb_seo_settings_get` — Read site-level SEO, AEO, and GEO settings that are also visible in the SlimWeb admin SEO settings page..
- `slimweb_seo_settings_update` — Update site-level SEO, AEO, GEO, Google Analytics traffic tracking, and social preview settings.
- `slimweb_facebook_settings_get` — Read the Facebook integration fields shown in the SlimWeb admin settings, including member-login App ID, Page ID, and Facebook comments toggles..
- `slimweb_facebook_settings_update` — Update the Facebook integration fields shown in the SlimWeb admin settings, including App ID, Page ID, and Facebook comments toggles..
- `slimweb_notion_settings_get` — Read Notion integration configuration status.
- `slimweb_notion_settings_update` — Update the Notion API token field shown in the SlimWeb admin settings..
- `slimweb_contact_settings_get` — Read every storefront contact field editable in SlimWeb Web admin..
- `slimweb_contact_settings_update` — Patch storefront contact settings.
- `slimweb_mail_delivery_settings_get` — Read SlimWeb mail delivery settings, including SMTP server fields, mail server availability, AI marketing email settings, and order/reminder notification options shown in the admin mail settings page.
- `slimweb_mail_delivery_settings_update` — Update SlimWeb mail delivery settings shown in the admin mail settings page.
- `slimweb_mail_templates_get` — Read SlimWeb event-specific email subjects and contents.
- `slimweb_mail_templates_update` — Update event-specific email subjects, HTML contents, or enabled state.
- `slimweb_mail_layout_get` — Read the single shared SlimWeb email layout wrapper.
- `slimweb_mail_layout_update` — Update the single shared SlimWeb email layout wrapper.
- `slimweb_payment_logistics_get` — Read supported SlimWeb payment/logistics providers, current site settings and callback URLs, including PayNow 7-ELEVEN frozen pickup and pay.
- `slimweb_payment_logistics_update` — Update supported SlimWeb payment/logistics provider credentials and enabled state.
- `slimweb_orders_list` — Search normal SlimWeb orders with the same admin filters.
- `slimweb_orders_profit_statistics` — Calculate store net profit for paid non-cancelled orders.
- `slimweb_orders_get` — Get one SlimWeb order by order_id or order_no, including line items and available_actions..
- `slimweb_orders_create_logistics` — Create a forward logistics order only when the exact provider/store_type appears in available_actions..
- `slimweb_orders_mark_shipped` — Manually mark an order as shipped/completed when no logistics order was created..
- `slimweb_returns_pending_list` — List active return orders that still need handling.
- `slimweb_returns_create_logistics` — Create reverse logistics only when the exact provider/type appears in available_actions..
- `slimweb_returns_cancel` — Cancel an active return and move it back to a normal completed order..
- `slimweb_returns_complete` — Manually mark a return completed when no reverse logistics exists..
- `slimweb_refunds_complete` — Manually mark an order as refunded for offline/manual refunds..
- `slimweb_refunds_create` — Create an online card refund request for ECPay or NewebPay only when available_actions includes create_refund..
- `slimweb_dashboard_summary` — Read dashboard KPI summary, recent orders, recent members, and low-stock products for a SlimWeb site..
- `slimweb_settings_get` — Read the SlimWeb site name and basic settings such as status, website type, default country, product load mode, return days, category_navigation_mode, the single active site logo..
- `slimweb_settings_update` — Update the SlimWeb site display name and basic settings, including the category navigation presentation mode and single active site logo.
- `slimweb_admins_list` — List site admins and permission keys.
- `slimweb_admins_upsert` — Create or update a site admin.
- `slimweb_admins_delete` — Delete a site admin.
- `slimweb_images_import_chatgpt_attachment` — Import one image from a ChatGPT web/desktop conversation attachment using OpenAI fileParams.
- `slimweb_debug_attachment_refs` — Debug what ChatGPT Remote MCP actually passes for conversation image attachments.
- `slimweb_uploads_create` — Create a short-lived Webless signed upload URL for an image.
- `slimweb_uploads_commit` — Commit a completed signed image upload.
- `slimweb_articles_list` — List articles for a SlimWeb site so the AI can choose an article to edit or avoid duplicates.
- `slimweb_articles_check_title` — Check whether an article title already exists within the active SlimWeb site.
- `slimweb_articles_get_content` — Read a single article by article_id before editing it.
- `slimweb_articles_create` — Create a new article.
- `slimweb_articles_update` — Update an existing article by article_id.
- `slimweb_content_seo_update` — Update content-level SEO/AEO/GEO metadata only as part of a page/article create or edit workflow.
- `slimweb_categories_list` — List product categories as a tree for a SlimWeb site.
- `slimweb_categories_upsert` — Create or update a product category using site_categories fields.
- `slimweb_categories_delete` — Delete a product category only when it and its child categories contain no products..
- `slimweb_nav_items_list` — List storefront navigation items as a tree for a SlimWeb site, including item type, URL, icon state, and children..
- `slimweb_nav_items_upsert` — Create or update a storefront navigation item.
- `slimweb_nav_items_delete` — Delete a storefront navigation item and its child navigation items..
- `slimweb_products_list` — List products by category, status, keyword, or low stock so the AI can avoid duplicate products or choose a product to edit..
- `slimweb_products_get` — Read one product including images, variants, and quantity discounts..
- `slimweb_product_image_reference_prepare` — Prepare one existing product image as an experimental ChatGPT visual reference for image-edit or related image-generation tasks.
- `slimweb_products_upsert` — Create or update one product using Webless product database fields.
- `slimweb_products_delete` — Delete one product and its stored product images..
- `slimweb_products_import_inspect` — Parse a CSV, XLSX, or SQL product import source and return columns, sample rows, category context, and target schema for the AI client to create a mapping.
- `slimweb_products_import_validate` — Validate AI-client generated product import mapping against parsed CSV, XLSX, or SQL rows.
- `slimweb_products_import_commit` — Import products using an AI-client generated mapping after user confirmation.
- `slimweb_coupon_templates_list` — List coupon templates visible in the SlimWeb admin coupon page.
- `slimweb_coupon_templates_upsert` — Create or update a SlimWeb coupon template using the same issue_trigger rules as the admin UI.
- `slimweb_members_coupons_issue` — Assign an active manual coupon template to one member.
- `slimweb_members_list` — List storefront members by keyword, status, tier, or spending range..
- `slimweb_members_get` — Read one member summary with recent orders and active manual coupons..
- `slimweb_member_email_preview` — Preview one non-marketing operational email before sending it to selected members.
- `slimweb_member_email_send` — Synchronously send one non-marketing operational email to selected active members, with optional arbitrary CC and BCC addresses.
- `slimweb_newsletters_create` — Create a scheduled SlimWeb newsletter for all active members from HTML composed by the external AI client; this does not require configured site AI or invoke server-side AI generation.
- `slimweb_posters_create` — Create a durable AI-generated ecommerce poster or branded graphic.
- `slimweb_discount_codes_list` — List discount codes for campaign tracking and storefront checkout rules..
- `slimweb_discount_codes_upsert` — Create or update one discount code.
- `slimweb_member_tiers_list` — List member tiers and spending thresholds..
- `slimweb_member_tiers_upsert` — Create or update one member tier..
- `slimweb_threshold_gifts_list` — List threshold gift rules and linked service products..
- `slimweb_threshold_gifts_upsert` — Create or update a threshold gift rule.
- `slimweb_product_add_ons_list` — List single-product add-on rules..
- `slimweb_product_add_ons_upsert` — Create or update one single-product add-on rule..
- `slimweb_customer_service_logs_list` — List recent AI customer-service logs with member context when available..
- `slimweb_customer_service_settings_get` — Read AI customer-service settings for a SlimWeb site..
- `slimweb_customer_service_settings_update` — Update AI customer-service settings.
- `slimweb_exports_create` — Create an immediate structured export for members, orders, or returns.
- `slimweb_audit_list` — List recent MCP tool execution records when the audit table exists, otherwise return an empty audit list with availability metadata..
- `slimweb_assets_upload` — Register a committed reusable asset such as an image for page, theme, product, or site use.
- `slimweb_pages_list` — List all fixed and custom site pages.
- `slimweb_pages_check_title` — Check whether a page title already exists for the selected site.
- `slimweb_pages_get_content` — Read an editable page by page_name and return content.html, the complete content.javascript source, enabled_libraries, javascript_asset, and javascript_conflicts.
- `slimweb_pages_create` — Create a new custom page.
- `slimweb_pages_update` — Update an existing editable page by page_name.
- `slimweb_pages_delete` — Delete a custom template page from Default and all non-Default themes.
- `slimweb_preview_get_page_url` — Return a preview URL for a page with explicit site, theme, and page parameters so the AI can inspect the page visually before editing or after page creation..

- `slimweb_guides_get` — Read the deployed guide index or a named workflow topic with a content version and hash. Generic read-only documentation, no site selection or site permission grant.
