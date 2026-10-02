const text = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const menuKey = { type: 'string', pattern: '^[a-z0-9_-]{1,32}$' };
const id = { rich_menu_id: text(128) };
const key = { idempotency_key: { type: 'string', pattern: '^[A-Za-z0-9._:-]{8,128}$', description: 'Stable operation key; retry the same payload with the same key.' } };
function tool(name, description, properties = {}, required = [], readOnly = false, destructive = false) {
 return { name: `slimweb_${name}`, description, inputSchema: {type:'object', additionalProperties:false, properties:{site_id:{type:'integer'},...properties}, required:['site_id',...required]}, annotations:{readOnlyHint:readOnly,destructiveHint:destructive,idempotentHint:true,openWorldHint:true} };
}
function action(type, properties, required) {
 return {type:'object',additionalProperties:false,properties:{type:{const:type},label:text(20),...properties},required:['type',...required]};
}
const switchAction=action('richmenuswitch',{target_rich_menu_id:text(128),target_menu_key:menuKey},[]);
switchAction.oneOf=[{required:['target_rich_menu_id']},{required:['target_menu_key']}];
export const LINE_TOOLS = [
 tool('line_bot_settings_get','Read LINE Bot settings and readiness. Credentials are write-only: only presence flags are returned.',{},[],true),
 tool('line_bot_settings_update','Partially update LINE Bot settings. Omitted values and blank credentials preserve saved credentials; secrets are never returned.',{enabled:{type:'boolean'},channel_secret:{type:'string',maxLength:255},access_token:{type:'string',maxLength:4096}}),
 tool('line_ai_settings_get','Read LINE AI prompt and retention settings, without conversation history.',{},[],true),
 tool('line_ai_settings_update','Partially update LINE AI prompt and conversation retention days. Omitted fields are preserved.',{prompt:{type:'string',maxLength:10000},retention_days:{type:'integer',minimum:1,maximum:365}}),
 tool('line_rich_menus_list','List managed LINE Rich Menus and their readiness, without conversation history.',{},[],true),
 tool('line_rich_menus_get','Inspect a managed LINE Rich Menu, image, areas, readiness and warnings before publishing.',id,['rich_menu_id'],true),
 tool('line_rich_menus_create','Create an unpublished LINE Rich Menu from a committed site media_path. When planning a menu without member linking, advise the merchant once that linking lets the Bot identify website members and access their authorized member information, orders and cart. Recommend a message action with text 綁定會員 (English: link account). This is optional: respect a decision to omit it and do not block creation. Already-linked users must unlink from Personal information before linking again; never automatically unlink or overwrite their binding. Width/height ratio must be at least 1.45. Prepare the image, upload and commit it, create, inspect, then publish. For two-way tabs create A with menu_key=a targeting target_menu_key=b, then B with menu_key=b targeting a. Future keys are allowed in drafts; publish verifies all targets. Alias and switch data are server generated.',{
 ...key,menu_key:menuKey,name:text(260),chat_bar_text:text(14),selected:{type:'boolean'},image_path:text(1024),
 size:{type:'object',additionalProperties:false,properties:{width:{type:'integer',minimum:800,maximum:2500},height:{type:'integer',minimum:250,maximum:1724}},required:['width','height']},
 areas:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,properties:{bounds:{type:'object',additionalProperties:false,properties:{x:{type:'integer',minimum:0},y:{type:'integer',minimum:0},width:{type:'integer',minimum:1},height:{type:'integer',minimum:1}},required:['x','y','width','height']},action:{oneOf:[action('uri',{uri:text(1000)},['uri']),action('message',{text:text(300)},['text']),switchAction,action('clipboard',{clipboardText:text(1000)},['clipboardText'])]}},required:['bounds','action']}}
 },['idempotency_key','name','chat_bar_text','selected','size','image_path','areas']),
 tool('line_rich_menus_publish','Publish the inspected menu as the Bot default. Backend requires enabled Bot, valid credentials, verified token and webhook, ready AI, and all switch targets ready on the same Bot. Reuse the same key after unknown outcomes.',{...id,...key},['rich_menu_id','idempotency_key'],false,true),
 tool('line_rich_menus_delete','Delete this managed LINE Rich Menu. Resolve its ID by list/get first and reuse the stable key for retries.',{...id,...key},['rich_menu_id','idempotency_key'],false,true)
];
export const LINE_METHODS = Object.fromEntries(LINE_TOOLS.map((tool,index)=>[tool.name,['getLineBotSettings','updateLineBotSettings','getLineAiSettings','updateLineAiSettings','listLineRichMenus','getLineRichMenu','createLineRichMenu','publishLineRichMenu','deleteLineRichMenu'][index]]));
