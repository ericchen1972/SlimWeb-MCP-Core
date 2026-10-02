import { createToolProfile } from './toolProfile.js';

const CAPABILITY_TOOLS = Object.freeze({
  line_friends_read: ['slimweb_line_friends_stats', 'slimweb_line_members_list'],
  line_push_write: ['slimweb_line_push_prepare', 'slimweb_line_push_send', 'slimweb_line_push_status'],
  line_bot_settings_read: ['slimweb_line_bot_settings_get'],
  line_bot_settings_write: ['slimweb_line_bot_settings_update'],
  line_ai_settings_read: ['slimweb_line_ai_settings_get'],
  line_ai_settings_write: ['slimweb_line_ai_settings_update'],
  line_rich_menus_read: ['slimweb_line_rich_menus_list', 'slimweb_line_rich_menus_get'],
  line_rich_menus_write: ['slimweb_line_rich_menus_create', 'slimweb_line_rich_menus_publish', 'slimweb_line_rich_menus_delete'],
  site_context: ['slimweb_auth_status', 'slimweb_sites_list', 'slimweb_site_select'],
  basic_settings_read: ['slimweb_settings_get'],
  basic_settings_write: ['slimweb_settings_update'],
  contact_settings_read: ['slimweb_contact_settings_get'],
  contact_settings_write: ['slimweb_contact_settings_update'],
  seo_settings_read: ['slimweb_seo_settings_get'],
  seo_settings_write: ['slimweb_seo_settings_update'],
  site_readiness_read: ['slimweb_site_readiness_get'],
  site_launch_progress_read: ['slimweb_site_launch_progress_get'],
  dashboard_summary_read: ['slimweb_dashboard_summary'],
  admins_read: ['slimweb_admins_list'],
  admins_write: ['slimweb_admins_upsert', 'slimweb_admins_delete']
});

const BATCH1_CAPABILITIES = Object.freeze(Object.keys(CAPABILITY_TOOLS).filter(name => !name.startsWith('line_')));

export function createCapabilityToolProfile(capabilities = []) {
  const supported = new Set(capabilities.filter((value) => Object.hasOwn(CAPABILITY_TOOLS, value)));
  const enabledTools = [...supported].flatMap((capability) => CAPABILITY_TOOLS[capability]);
  const hasCompleteBatch1 = BATCH1_CAPABILITIES.every((capability) => supported.has(capability));

  return createToolProfile({
    enabledTools,
    schemaProjections: hasCompleteBatch1 ? {} : {
      slimweb_settings_update: ['site_id', 'name']
    }
  });
}

export { CAPABILITY_TOOLS };
