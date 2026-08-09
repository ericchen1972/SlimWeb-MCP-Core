export class BackendRepositoryError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'BackendRepositoryError';
    this.code = options.code ?? 'UPSTREAM_FAILED';
    this.status = options.status ?? null;
    this.details = options.details ?? {};
    this.requestId = options.requestId ?? null;
    this.cause = options.cause;
  }
}

const BackendError = BackendRepositoryError;

export class SlimWebBackendRepository {
  constructor({
    transport,
    idempotencyKeyFactory = () => crypto.randomUUID(),
    posterPollIntervalMs = 5_000,
    posterTimeoutMs = 780_000
  } = {}) {
    if (!transport || typeof transport.request !== 'function') {
      throw new TypeError('A transport with request() is required.');
    }
    this.transport = transport;
    this.idempotencyKeyFactory = idempotencyKeyFactory;
    this.posterPollIntervalMs = Math.max(0, Number(posterPollIntervalMs) || 0);
    this.posterTimeoutMs = Math.max(1_000, Number(posterTimeoutMs) || 780_000);
    assertSlimWebBackend(this);
  }

  async listAdminSitesForGoogleProfile(profile) {
    return this.listSitesForAdminIdentity({
      email: profile.email,
      name: profile.name,
      google_id: profile.sub,
      resource_context: profile.resource_context ?? null
    });
  }

  async listThemesForAccountSite(actor, args) {
    return this.listThemes(actor, args);
  }

  async uploadAsset(actor, args) {
    return this.registerAsset(actor, args);
  }

  async listSitesForAdminIdentity(identity) {
    const data = await this.request('/internal/mcp/v1/sites', {
      identity,
      tool: 'slimweb_sites_list',
      permission: 'backend_ai_assistant'
    });

    return data.sites;
  }

  async resolveAdminSiteForIdentity(identity, args) {
    const siteCode = String(args?.site_code ?? '').trim();
    const selector = siteCode !== ''
      ? { site_code: siteCode }
      : { site_id: args?.site_id };
    const data = await this.request('/internal/mcp/v1/site-context/resolve', {
      method: 'POST',
      identity,
      tool: 'slimweb_site_select',
      permission: 'backend_ai_assistant',
      body: selector
    });

    return {
      ...identity,
      ...data.actor,
      site: data.site
    };
  }

  async selectSiteForAdminIdentity(identity, args) {
    const actor = await this.resolveAdminSiteForIdentity(identity, args);
    const data = await this.request(this.sitePath(actor, '/themes?include_default=1'), {
      identity: actor,
      tool: 'slimweb_site_select',
      permission: 'page_management_templates'
    });

    return {
      selected_site: actor.site,
      site_admin_id: actor.site_admin_id,
      permissions: actor.permissions,
      themes: data.themes,
      requires_site_code_for_mutations: true
    };
  }

  async getBasicSettings(actor) {
    return this.request(this.settingsPath(actor), {
      identity: actor,
      tool: 'slimweb_settings_get',
      permission: 'basic_settings'
    });
  }

  async updateBasicSettings(actor, args) {
    const { site_id: _siteId, site_code: _siteCode, ...patch } = args ?? {};

    return this.request(this.settingsPath(actor), {
      method: 'PATCH',
      identity: actor,
      tool: 'slimweb_settings_update',
      permission: 'basic_settings',
      idempotencyKey: this.idempotencyKeyFactory(),
      body: patch
    });
  }

  async getSiteReadiness(actor, args) {
    return this.operationalRead(actor, '/operations/readiness', 'slimweb_site_readiness_get', '', args, ['include_optional']);
  }

  async getSiteLaunchProgress(actor, args) {
    return this.operationalRead(actor, '/operations/launch-progress', 'slimweb_site_launch_progress_get', '', args, ['include_optional']);
  }

  async getSeoSettings(actor) {
    return this.operationalRead(actor, '/settings/seo', 'slimweb_seo_settings_get', 'seo_settings');
  }

  async updateSeoSettings(actor, args) {
    return this.operationalMutation(actor, '/settings/seo', 'slimweb_seo_settings_update', 'seo_settings', args);
  }

  async getFacebookSettings(actor) {
    return this.operationalRead(actor, '/integrations/facebook', 'slimweb_facebook_settings_get', 'integration_settings');
  }

  async updateFacebookSettings(actor, args) {
    return this.operationalMutation(actor, '/integrations/facebook', 'slimweb_facebook_settings_update', 'integration_settings', args);
  }

  async getNotionSettings(actor) {
    return this.operationalRead(actor, '/integrations/notion', 'slimweb_notion_settings_get', 'integration_settings');
  }

  async updateNotionSettings(actor, args) {
    return this.operationalMutation(actor, '/integrations/notion', 'slimweb_notion_settings_update', 'integration_settings', args);
  }

  async getContactSettings(actor) {
    return this.operationalRead(actor, '/settings/contact', 'slimweb_contact_settings_get', 'basic_settings');
  }

  async updateContactSettings(actor, args) {
    return this.operationalMutation(actor, '/settings/contact', 'slimweb_contact_settings_update', 'basic_settings', args);
  }

  async getDashboardSummary(actor) {
    return this.operationalRead(actor, '/operations/dashboard-summary', 'slimweb_dashboard_summary', '');
  }

  async getMailDeliverySettings(actor) {
    return this.operationalRead(actor, '/communications/mail-delivery', 'slimweb_mail_delivery_settings_get', 'notification_settings');
  }

  async updateMailDeliverySettings(actor, args) {
    return this.operationalMutation(actor, '/communications/mail-delivery', 'slimweb_mail_delivery_settings_update', 'notification_settings', args);
  }

  async getMailTemplates(actor) {
    return this.operationalRead(actor, '/communications/mail-templates', 'slimweb_mail_templates_get', 'notification_settings');
  }

  async updateMailTemplates(actor, args) {
    return this.operationalMutation(actor, '/communications/mail-templates', 'slimweb_mail_templates_update', 'notification_settings', args);
  }

  async getMailLayout(actor) {
    return this.operationalRead(actor, '/communications/mail-layout', 'slimweb_mail_layout_get', 'notification_settings');
  }

  async updateMailLayout(actor, args) {
    return this.operationalMutation(actor, '/communications/mail-layout', 'slimweb_mail_layout_update', 'notification_settings', args);
  }

  async listAdmins(actor) {
    return this.operationalRead(actor, '/operations/admins', 'slimweb_admins_list', 'system_admin');
  }

  async upsertAdmin(actor, args) {
    return this.operationalMutation(actor, '/operations/admins', 'slimweb_admins_upsert', 'system_admin', args);
  }

  async deleteAdmin(actor, args) {
    const { admin_id: adminId, ...body } = this.withoutSiteSelector(args);
    return this.operationalMutation(actor, `/operations/admins/${this.requiredId(adminId, 'admin_id')}`, 'slimweb_admins_delete', 'system_admin', body, 'DELETE');
  }

  async createNewsletter(actor, args) {
    return this.operationalMutation(actor, '/communications/newsletters', 'slimweb_newsletters_create', 'newsletter_management', args, 'POST');
  }

  async listNewsletters(actor, args) {
    return this.operationalRead(actor, '/communications/newsletters', 'slimweb_newsletters_list', 'newsletter_management', args, ['page', 'per_page']);
  }

  async getNewsletter(actor, args) {
    return this.newsletterRead(actor, args, 'slimweb_newsletters_get');
  }

  async updateNewsletter(actor, args) {
    const { newsletter_id: newsletterId, ...body } = this.withoutSiteSelector(args);
    return this.operationalMutation(actor, `/communications/newsletters/${this.requiredId(newsletterId, 'newsletter_id')}`, 'slimweb_newsletters_update', 'newsletter_management', body);
  }

  async deleteNewsletter(actor, args) {
    const { newsletter_id: newsletterId, ...body } = this.withoutSiteSelector(args);
    return this.operationalMutation(actor, `/communications/newsletters/${this.requiredId(newsletterId, 'newsletter_id')}`, 'slimweb_newsletters_delete', 'newsletter_management', body, 'DELETE');
  }

  async newsletterRead(actor, args, tool) {
    const newsletterId = this.requiredId(args?.newsletter_id, 'newsletter_id');
    return this.operationalRead(actor, `/communications/newsletters/${newsletterId}`, tool, 'newsletter_management');
  }

  async searchNotionPages(actor, args) {
    return this.request(this.sitePath(actor, '/integrations/notion/pages/search'), { method: 'POST', identity: actor, tool: 'slimweb_notion_pages_search', permission: 'integration_settings', body: this.withoutSiteSelector(args) });
  }

  async getNotionPageContent(actor, args) {
    return this.request(this.sitePath(actor, '/integrations/notion/pages/content'), { method: 'POST', identity: actor, tool: 'slimweb_notion_page_content_get', permission: 'integration_settings', body: this.withoutSiteSelector(args) });
  }

  async createPoster(actor, args) {
    const payload = await this.operationalMutation(actor, '/operations/posters', 'slimweb_posters_create', 'ai_management', args, 'POST');
    return this.pollPoster(actor, payload);
  }

  async pollPoster(actor, payload) {
    if (!payload?.queued || !payload?.job_id) return payload;
    const deadline = Date.now() + this.posterTimeoutMs;
    while (Date.now() < deadline) {
      if (this.posterPollIntervalMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(this.posterPollIntervalMs, deadline - Date.now())));
      const status = await this.operationalRead(actor, `/operations/posters/${encodeURIComponent(payload.job_id)}`, 'slimweb_posters_create', 'ai_management');
      if (status?.status === 'completed') return status;
      if (status?.status === 'failed') throw new BackendError(status.message || 'Poster generation failed.', { code: 'UPSTREAM_ERROR', details: { job_id: payload.job_id } });
    }
    throw new BackendError('Poster generation did not finish before the MCP timeout.', { code: 'UPSTREAM_TIMEOUT', details: { job_id: payload.job_id } });
  }

  async listCustomerServiceLogs(actor, args) {
    return this.operationalRead(actor, '/operations/customer-service/logs', 'slimweb_customer_service_logs_list', 'ai_customer_service', args, ['page', 'per_page', 'member_id', 'keyword']);
  }

  async deleteCustomerServiceLog(actor, args) {
    const { customer_service_log_id: logId, ...body } = this.withoutSiteSelector(args);
    return this.operationalMutation(actor, `/operations/customer-service/logs/${this.requiredId(logId, 'customer_service_log_id')}`, 'slimweb_customer_service_logs_delete', 'ai_customer_service', body, 'DELETE');
  }

  async getCustomerServiceSettings(actor) {
    return this.operationalRead(actor, '/operations/customer-service/settings', 'slimweb_customer_service_settings_get', 'ai_customer_service');
  }

  async updateCustomerServiceSettings(actor, args) {
    return this.operationalMutation(actor, '/operations/customer-service/settings', 'slimweb_customer_service_settings_update', 'ai_customer_service', args);
  }

  async createExport(actor, args) {
    return this.operationalMutation(actor, '/operations/exports', 'slimweb_exports_create', 'system_admin', args, 'POST');
  }

  async listAuditLogs(actor, args) {
    return this.operationalRead(actor, '/operations/audit', 'slimweb_audit_logs_list', 'system_admin', args, ['limit', 'tool_name']);
  }

  async listCategories(actor) {
    return this.request(this.sitePath(actor, '/catalog/categories'), {
      identity: actor,
      tool: 'slimweb_categories_list',
      permission: 'product_management_categories'
    });
  }

  async upsertCategory(actor, args) {
    return this.catalogMutation(actor, '/catalog/categories', 'PUT', 'slimweb_categories_upsert', 'product_management_categories', args);
  }

  async deleteCategory(actor, args) {
    return this.catalogMutation(actor, `/catalog/categories/${this.requiredId(args?.category_id, 'category_id')}`, 'DELETE', 'slimweb_categories_delete', 'product_management_categories', {});
  }

  async listNavItems(actor) {
    return this.request(this.sitePath(actor, '/navigation/items'), {
      identity: actor,
      tool: 'slimweb_nav_items_list',
      permission: 'page_management_navbar'
    });
  }

  async upsertNavItem(actor, args) {
    return this.catalogMutation(actor, '/navigation/items', 'PUT', 'slimweb_nav_items_upsert', 'page_management_navbar', args);
  }

  async deleteNavItem(actor, args) {
    return this.catalogMutation(actor, `/navigation/items/${this.requiredId(args?.nav_item_id, 'nav_item_id')}`, 'DELETE', 'slimweb_nav_items_delete', 'page_management_navbar', {});
  }

  async listProducts(actor, args) {
    const filters = this.withoutSiteSelector(args);
    const query = new URLSearchParams();
    for (const field of ['category_id', 'keyword', 'status', 'max_stock', 'page', 'per_page']) {
      if (filters[field] !== undefined && filters[field] !== null && filters[field] !== '') {
        query.set(field, String(filters[field]));
      }
    }
    const suffix = `/catalog/products${query.size > 0 ? `?${query}` : ''}`;

    return this.request(this.sitePath(actor, suffix), {
      identity: actor,
      tool: 'slimweb_products_list',
      permission: 'product_management_products'
    });
  }

  async getProduct(actor, args) {
    return this.request(this.sitePath(actor, `/catalog/products/${this.requiredId(args?.product_id, 'product_id')}`), {
      identity: actor,
      tool: 'slimweb_products_get',
      permission: 'product_management_products'
    });
  }

  async prepareProductImageReference(actor, args) {
    return this.request(this.sitePath(actor, '/catalog/product-image-reference'), {
      method: 'POST',
      identity: actor,
      tool: 'slimweb_product_image_reference_prepare',
      body: this.withoutSiteSelector(args)
    });
  }

  async upsertProduct(actor, args) {
    return this.catalogMutation(actor, '/catalog/products', 'PUT', 'slimweb_products_upsert', 'product_management_products', args);
  }

  async deleteProduct(actor, args) {
    return this.catalogMutation(actor, `/catalog/products/${this.requiredId(args?.product_id, 'product_id')}`, 'DELETE', 'slimweb_products_delete', 'product_management_products', {});
  }

  async inspectProductImport(actor, args) {
    return this.request(this.sitePath(actor, '/catalog/imports/inspect'), {
      method: 'POST',
      identity: actor,
      tool: 'slimweb_products_import_inspect',
      permission: 'product_management_import',
      body: this.withoutSiteSelector(args)
    });
  }

  async validateProductImport(actor, args) {
    return this.request(this.sitePath(actor, '/catalog/imports/validate'), {
      method: 'POST',
      identity: actor,
      tool: 'slimweb_products_import_validate',
      permission: 'product_management_import',
      body: this.withoutSiteSelector(args)
    });
  }

  async commitProductImport(actor, args) {
    return this.catalogMutation(actor, '/catalog/imports/commit', 'POST', 'slimweb_products_import_commit', 'product_management_import', args);
  }

  async listArticles(actor, args) {
    const filters = this.withoutSiteSelector(args);
    const query = new URLSearchParams();
    for (const field of ['page', 'per_page']) {
      if (filters[field] !== undefined && filters[field] !== null && filters[field] !== '') query.set(field, String(filters[field]));
    }
    return this.request(this.sitePath(actor, `/content/articles${query.size ? `?${query}` : ''}`), {
      identity: actor,
      tool: 'slimweb_articles_list',
      permission: 'page_management_articles'
    });
  }

  async checkArticleTitle(actor, args) {
    const query = new URLSearchParams({ title: String(args?.title ?? '') });
    return this.request(this.sitePath(actor, `/content/articles/title-check?${query}`), {
      identity: actor,
      tool: 'slimweb_articles_check_title',
      permission: 'page_management_articles'
    });
  }

  async getArticleContent(actor, args) {
    return this.request(this.sitePath(actor, `/content/articles/${this.requiredId(args?.article_id, 'article_id')}`), {
      identity: actor,
      tool: 'slimweb_articles_get_content',
      permission: 'page_management_articles'
    });
  }

  async createArticle(actor, args) {
    return this.catalogMutation(actor, '/content/articles', 'PUT', 'slimweb_articles_create', 'page_management_articles', args);
  }

  async updateArticle(actor, args) {
    return this.catalogMutation(actor, '/content/articles', 'PUT', 'slimweb_articles_update', 'page_management_articles', args);
  }

  async deleteArticle(actor, args) {
    return this.catalogMutation(actor, `/content/articles/${this.requiredId(args?.article_id, 'article_id')}`, 'DELETE', 'slimweb_articles_delete', 'page_management_articles', {});
  }

  async listPages(actor) {
    return this.request(this.sitePath(actor, '/content/pages'), { identity: actor, tool: 'slimweb_pages_list', permission: 'page_management_pages' });
  }

  async checkPageTitle(actor, args) {
    const query = new URLSearchParams({ title: String(args?.title ?? '') });
    return this.request(this.sitePath(actor, `/content/pages/title-check?${query}`), { identity: actor, tool: 'slimweb_pages_check_title', permission: 'page_management_pages' });
  }

  async getPageContent(actor, args) {
    const query = new URLSearchParams({ name: String(args?.page_name ?? '') });
    return this.request(this.sitePath(actor, `/content/pages/resolve?${query}`), { identity: actor, tool: 'slimweb_pages_get_content', permission: 'page_management_pages' });
  }

  async createPage(actor, args) {
    return this.catalogMutation(actor, '/content/pages', 'PUT', 'slimweb_pages_create', 'page_management_pages', args);
  }

  async updatePage(actor, args) {
    return this.catalogMutation(actor, '/content/pages', 'PUT', 'slimweb_pages_update', 'page_management_pages', args);
  }

  async getPagePreviewUrl(actor, args) {
    return this.request(this.sitePath(actor, '/content/pages/preview'), { method: 'POST', identity: actor, tool: 'slimweb_preview_get_page_url', permission: 'page_management_pages', body: this.withoutSiteSelector(args) });
  }

  async deletePage(actor, args) {
    const key = String(args?.page_key ?? '').trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,99}$/i.test(key)) throw new BackendError('page_key is invalid.', { code: 'VALIDATION_FAILED' });
    return this.catalogMutation(actor, `/content/pages/${encodeURIComponent(key)}`, 'DELETE', 'slimweb_pages_delete', 'page_management_pages', {});
  }

  async createUpload(actor, args) {
    return this.request(this.sitePath(actor, '/media/uploads'), {
      method: 'POST', identity: actor, tool: 'slimweb_uploads_create', body: this.withoutSiteSelector(args)
    });
  }

  async commitUpload(actor, args) {
    const uploadId = String(args?.upload_id ?? '').trim();
    if (!/^[A-Za-z0-9._-]{8,128}$/.test(uploadId)) throw new BackendError('upload_id is invalid.', { code: 'VALIDATION_FAILED' });
    return this.request(this.sitePath(actor, `/media/uploads/${encodeURIComponent(uploadId)}/commit`), {
      method: 'POST', identity: actor, tool: 'slimweb_uploads_commit', body: this.withoutSiteSelector(args)
    });
  }

  async listThemes(actor) {
    return this.request(this.sitePath(actor, '/themes'), { identity: actor, tool: 'slimweb_themes_list', permission: 'page_management_templates' });
  }

  async getSiteThemeMode(actor) {
    return this.request(this.sitePath(actor, '/theme-mode'), { identity: actor, tool: 'slimweb_site_theme_mode_get', permission: 'page_management_templates' });
  }

  async getDesignContext(actor) {
    return this.request(this.sitePath(actor, '/design-context'), { identity: actor, tool: 'slimweb_design_context_get', permission: 'page_management_templates' });
  }

  async updateSiteThemeMode(actor, args) {
    return this.themeMutation(actor, '/theme-mode', 'PATCH', 'slimweb_site_theme_mode_update', args);
  }

  async createThemeFromDefault(actor, args) {
    return this.themeMutation(actor, '/themes', 'POST', 'slimweb_themes_create_from_default', args);
  }

  async activateTheme(actor, args) {
    return this.themeMutation(actor, `/themes/${this.themeId(args)}/activate`, 'POST', 'slimweb_themes_activate', {});
  }

  async deleteTheme(actor, args) {
    return this.themeMutation(actor, `/themes/${this.themeId(args)}`, 'DELETE', 'slimweb_themes_delete', {});
  }

  async getThemeShellContext(actor, args) {
    return this.request(this.sitePath(actor, `/themes/${this.themeId(args)}/shell-context`), { identity: actor, tool: 'slimweb_theme_shell_get_context', permission: 'page_management_templates' });
  }

  async updateThemeRootElements(actor, args) {
    return this.themeMutation(actor, `/themes/${this.themeId(args)}/root-elements`, 'PUT', 'slimweb_themes_update_root_elements', args);
  }

  async getThemeStyleProfile(actor, args) {
    return this.request(this.sitePath(actor, `/themes/${this.themeId(args)}/style-profile`), { identity: actor, tool: 'slimweb_theme_style_profile_get', permission: 'page_management_templates' });
  }

  async upsertThemeStyleProfile(actor, args) {
    return this.themeMutation(actor, `/themes/${this.themeId(args)}/style-profile`, 'PUT', 'slimweb_theme_style_profile_upsert', args);
  }

  async appendThemeStyleProfileRequest(actor, args) {
    return this.themeMutation(actor, `/themes/${this.themeId(args)}/style-profile/requests`, 'POST', 'slimweb_theme_style_profile_append_request', args);
  }

  async themeMutation(actor, suffix, method, tool, args) {
    const body = this.withoutSiteSelector(args);
    delete body.theme_id;
    return this.request(this.sitePath(actor, suffix), { method, identity: actor, tool, permission: 'page_management_templates', idempotencyKey: this.idempotencyKeyFactory(), body });
  }

  themeId(args) {
    const value = typeof args?.theme_id === 'object' && args.theme_id !== null ? args.theme_id.id : args?.theme_id;
    if (String(value).toLowerCase() === 'default') return 'default';
    return String(this.requiredId(value, 'theme_id'));
  }

  async getMediaLibraryStats(actor, args) {
    const query = new URLSearchParams();
    if (args?.include_unused_assets !== undefined) query.set('include_unused_assets', String(Boolean(args.include_unused_assets)));
    return this.request(this.sitePath(actor, `/media/library/stats${query.size ? `?${query}` : ''}`), { identity: actor, tool: 'slimweb_media_library_stats' });
  }

  async deleteUnusedMedia(actor) {
    return this.request(this.sitePath(actor, '/media/library/unused'), { method: 'DELETE', identity: actor, tool: 'slimweb_media_library_delete_unused', idempotencyKey: this.idempotencyKeyFactory(), body: {} });
  }

  async registerAsset(actor, args) {
    return this.request(this.sitePath(actor, '/media/assets/register'), { method: 'POST', identity: actor, tool: 'slimweb_assets_upload', idempotencyKey: this.idempotencyKeyFactory(), body: this.withoutSiteSelector(args) });
  }

  async listExternalAssets(actor) {
    return this.request(this.sitePath(actor, '/external-assets'), { identity: actor, tool: 'slimweb_external_assets_list', permission: 'page_management_external_assets' });
  }

  async deleteExternalAsset(actor, args) {
    return this.request(this.sitePath(actor, `/external-assets/${this.requiredId(args?.asset_id, 'asset_id')}`), {
      method: 'DELETE', identity: actor, tool: 'slimweb_external_assets_delete', permission: 'page_management_external_assets', idempotencyKey: this.idempotencyKeyFactory(), body: {}
    });
  }

  async updateContentSeo(actor, args) {
    return this.request(this.sitePath(actor, '/content/seo'), {
      method: 'PUT', identity: actor, tool: 'slimweb_content_seo_update', idempotencyKey: this.idempotencyKeyFactory(), body: this.withoutSiteSelector(args)
    });
  }

  async importChatGptAttachment(actor, args) {
    return this.request(this.sitePath(actor, '/media/imports/chatgpt-attachment'), {
      method: 'POST', identity: actor, tool: 'slimweb_images_import_chatgpt_attachment', idempotencyKey: this.idempotencyKeyFactory(), body: this.withoutSiteSelector(args)
    });
  }

  async getPaymentLogisticsSettings(actor) {
    return this.request(this.sitePath(actor, '/commerce/settings/providers'), {
      identity: actor,
      tool: 'slimweb_payment_logistics_get',
      permission: 'payments_shipping'
    });
  }

  async updatePaymentLogisticsSettings(actor, args) {
    return this.request(this.sitePath(actor, '/commerce/settings/providers'), {
      method: 'PUT',
      identity: actor,
      tool: 'slimweb_payment_logistics_update',
      permission: 'payments_shipping',
      idempotencyKey: this.idempotencyKeyFactory(),
      body: this.withoutSiteSelector(args)
    });
  }

  async listCouponTemplates(actor, args) {
    return this.commerceList(actor, '/commerce/coupon-templates', 'slimweb_coupon_templates_list', 'coupon_management', args, ['issue_trigger', 'keyword', 'status', 'page', 'per_page']);
  }

  async upsertCouponTemplate(actor, args) {
    return this.commerceMutation(actor, '/commerce/coupon-templates', 'PUT', 'slimweb_coupon_templates_upsert', 'coupon_management', args);
  }

  async issueMemberCoupon(actor, args) {
    return this.commerceMutation(actor, `/commerce/members/${this.requiredId(args?.member_id, 'member_id')}/coupons`, 'POST', 'slimweb_members_coupons_issue', 'coupon_management', args, ['member_id']);
  }

  async listMembers(actor, args) {
    return this.commerceList(actor, '/commerce/members', 'slimweb_members_list', 'member_list', args, ['keyword', 'status', 'min_spent', 'max_spent', 'page', 'per_page']);
  }

  async getMember(actor, args) {
    return this.request(this.sitePath(actor, `/commerce/members/${this.requiredId(args?.member_id, 'member_id')}`), { identity: actor, tool: 'slimweb_members_get', permission: 'member_list' });
  }

  async deleteMember(actor, args) {
    return this.commerceMutation(actor, `/commerce/members/${this.requiredId(args?.member_id, 'member_id')}`, 'DELETE', 'slimweb_members_delete', 'member_list', args, ['member_id']);
  }

  async revokeMemberCoupon(actor, args) {
    return this.commerceMutation(actor, `/commerce/members/${this.requiredId(args?.member_id, 'member_id')}/coupons/${this.requiredId(args?.member_coupon_id, 'member_coupon_id')}`, 'DELETE', 'slimweb_members_coupons_revoke', 'member_list', args, ['member_id', 'member_coupon_id']);
  }

  async listDiscountCodes(actor, args) {
    return this.commerceList(actor, '/commerce/discount-codes', 'slimweb_discount_codes_list', 'discount_code_management', args, ['keyword', 'platform', 'page', 'per_page']);
  }

  async upsertDiscountCode(actor, args) {
    return this.commerceMutation(actor, '/commerce/discount-codes', 'PUT', 'slimweb_discount_codes_upsert', 'discount_code_management', args);
  }

  async deleteDiscountCode(actor, args) {
    return this.commerceMutation(actor, `/commerce/discount-codes/${this.requiredId(args?.discount_code_id, 'discount_code_id')}`, 'DELETE', 'slimweb_discount_codes_delete', 'discount_code_management', args, ['discount_code_id']);
  }

  async listMemberTiers(actor) {
    return this.request(this.sitePath(actor, '/commerce/member-tiers'), { identity: actor, tool: 'slimweb_member_tiers_list', permission: 'member_levels' });
  }

  async upsertMemberTier(actor, args) {
    return this.commerceMutation(actor, '/commerce/member-tiers', 'PUT', 'slimweb_member_tiers_upsert', 'member_levels', args);
  }

  async deleteMemberTier(actor, args) {
    return this.commerceMutation(actor, `/commerce/member-tiers/${this.requiredId(args?.member_tier_id, 'member_tier_id')}`, 'DELETE', 'slimweb_member_tiers_delete', 'member_levels', args, ['member_tier_id']);
  }

  async listThresholdGifts(actor, args) {
    return this.commerceList(actor, '/commerce/threshold-gifts', 'slimweb_threshold_gifts_list', 'threshold_gift_management', args, ['is_active']);
  }

  async upsertThresholdGift(actor, args) {
    return this.commerceMutation(actor, '/commerce/threshold-gifts', 'PUT', 'slimweb_threshold_gifts_upsert', 'threshold_gift_management', args);
  }

  async deleteThresholdGift(actor, args) {
    return this.commerceMutation(actor, `/commerce/threshold-gifts/${this.requiredId(args?.threshold_gift_id, 'threshold_gift_id')}`, 'DELETE', 'slimweb_threshold_gifts_delete', 'threshold_gift_management', args, ['threshold_gift_id']);
  }

  async listProductAddOns(actor, args) {
    return this.commerceList(actor, '/commerce/product-add-ons', 'slimweb_product_add_ons_list', 'add_on_product_management', args, ['product_id', 'is_active']);
  }

  async upsertProductAddOn(actor, args) {
    return this.commerceMutation(actor, '/commerce/product-add-ons', 'PUT', 'slimweb_product_add_ons_upsert', 'add_on_product_management', args);
  }

  async deleteProductAddOn(actor, args) {
    return this.commerceMutation(actor, `/commerce/product-add-ons/${this.requiredId(args?.product_add_on_id, 'product_add_on_id')}`, 'DELETE', 'slimweb_product_add_ons_delete', 'add_on_product_management', args, ['product_add_on_id']);
  }

  async listOrders(actor, args) {
    return this.commerceList(actor, '/commerce/orders', 'slimweb_orders_list', 'orders_management', args, ['search_order_no', 'search_field', 'search_value', 'fuzzy', 'date_from', 'date_to', 'amount_min', 'amount_max', 'logistics_status', 'statuses', 'limit', 'offset']);
  }

  async calculateOrderProfitStatistics(actor, args) {
    return this.commerceList(actor, '/commerce/orders/profit-statistics', 'slimweb_orders_profit_statistics', 'order_profit_statistics', args, ['date_from', 'date_to']);
  }

  async getOrder(actor, args) {
    return this.commerceList(actor, '/commerce/orders/detail', 'slimweb_orders_get', 'orders_management', args, ['order_id', 'order_no']);
  }

  async createOrderLogistics(actor, args) {
    return this.commerceMutation(actor, '/commerce/orders/logistics', 'POST', 'slimweb_orders_create_logistics', 'payments_shipping', args);
  }

  async markOrderShipped(actor, args) {
    return this.commerceMutation(actor, '/commerce/orders/mark-shipped', 'POST', 'slimweb_orders_mark_shipped', 'orders_management', args);
  }

  async listPendingReturns(actor, args) {
    return this.commerceList(actor, '/commerce/returns/pending', 'slimweb_returns_pending_list', 'returns_management', args, ['search_order_no', 'limit', 'offset']);
  }

  async createReturnLogistics(actor, args) {
    return this.commerceMutation(actor, '/commerce/returns/logistics', 'POST', 'slimweb_returns_create_logistics', 'returns_management', args);
  }

  async cancelReturn(actor, args) {
    return this.commerceMutation(actor, '/commerce/returns/cancel', 'POST', 'slimweb_returns_cancel', 'returns_management', args);
  }

  async completeReturn(actor, args) {
    return this.commerceMutation(actor, '/commerce/returns/complete', 'POST', 'slimweb_returns_complete', 'returns_management', args);
  }

  async completeRefund(actor, args) {
    return this.commerceMutation(actor, '/commerce/refunds/complete', 'POST', 'slimweb_refunds_complete', 'returns_management', args);
  }

  async createRefund(actor, args) {
    return this.commerceMutation(actor, '/commerce/refunds', 'POST', 'slimweb_refunds_create', 'returns_management', args);
  }

  async updateOrdersStatus(actor, args) {
    return this.commerceMutation(actor, '/commerce/orders/status', 'PATCH', 'slimweb_orders_update_status', 'orders_management', args);
  }

  async updateOrdersRecipient(actor, args) {
    return this.commerceMutation(actor, '/commerce/orders/recipient', 'PATCH', 'slimweb_orders_update_recipient', 'orders_management', args);
  }

  async deleteOrders(actor, args) {
    return this.commerceMutation(actor, '/commerce/orders', 'DELETE', 'slimweb_orders_delete', 'orders_management', args);
  }

  async getWaybillUrl(actor, args) {
    return this.orderWaybill(actor, '/commerce/orders/waybill-url', 'slimweb_orders_get_waybill_url', 'orders_management', args);
  }

  async getReturnWaybillUrl(actor, args) {
    return this.orderWaybill(actor, '/commerce/returns/waybill-url', 'slimweb_returns_get_waybill_url', 'returns_management', args);
  }

  async orderWaybill(actor, suffix, tool, permission, args) {
    return this.request(this.sitePath(actor, suffix), {
      method: 'POST',
      identity: actor,
      tool,
      permission,
      body: this.withoutSiteSelector(args)
    });
  }

  async operationalRead(actor, suffix, tool, permission, args = {}, fields = []) {
    const query = new URLSearchParams();
    const filters = this.withoutSiteSelector(args);
    for (const field of fields) {
      if (filters[field] !== undefined && filters[field] !== null && filters[field] !== '') query.set(field, String(filters[field]));
    }
    return this.request(this.sitePath(actor, `${suffix}${query.size ? `?${query}` : ''}`), { identity: actor, tool, permission });
  }

  async operationalMutation(actor, suffix, tool, permission, args, method = 'PUT') {
    return this.request(this.sitePath(actor, suffix), {
      method,
      identity: actor,
      tool,
      permission,
      idempotencyKey: this.idempotencyKeyFactory(),
      body: this.withoutSiteSelector(args)
    });
  }

  async commerceList(actor, suffix, tool, permission, args, fields) {
    const filters = this.withoutSiteSelector(args);
    const query = new URLSearchParams();
    for (const field of fields) {
      if (filters[field] !== undefined && filters[field] !== null && filters[field] !== '') {
        if (Array.isArray(filters[field])) {
          for (const value of filters[field]) query.append(`${field}[]`, String(value));
        } else {
          query.set(field, String(filters[field]));
        }
      }
    }
    return this.request(this.sitePath(actor, `${suffix}${query.size ? `?${query}` : ''}`), { identity: actor, tool, permission });
  }

  async commerceMutation(actor, suffix, method, tool, permission, args, removedFields = []) {
    const body = this.withoutSiteSelector(args);
    for (const field of removedFields) delete body[field];
    return this.request(this.sitePath(actor, suffix), { method, identity: actor, tool, permission, idempotencyKey: this.idempotencyKeyFactory(), body });
  }

  async catalogMutation(actor, suffix, method, tool, permission, args) {
    return this.request(this.sitePath(actor, suffix), {
      method,
      identity: actor,
      tool,
      permission,
      idempotencyKey: this.idempotencyKeyFactory(),
      body: this.withoutSiteSelector(args)
    });
  }

  sitePath(actor, suffix = '') {
    const siteCode = String(actor?.site?.site_code ?? '').trim();
    if (siteCode === '') {
      throw new BackendError('The resolved site has no site_code.', {
        code: 'UPSTREAM_INVALID_RESPONSE'
      });
    }

    return `/internal/mcp/v1/sites/${encodeURIComponent(siteCode)}${suffix}`;
  }

  withoutSiteSelector(args) {
    const { site_id: _siteId, site_code: _siteCode, ...body } = args ?? {};
    return body;
  }

  requiredId(value, field) {
    const id = Number.parseInt(value, 10);
    if (!Number.isInteger(id) || id < 1) {
      throw new BackendError(`${field} must be a positive integer.`, {
        code: 'VALIDATION_FAILED'
      });
    }

    return id;
  }

  settingsPath(actor) {
    return this.sitePath(actor, '/settings/basic');
  }


  async request(path, options = {}) {
    return this.transport.request({
      method: options.method ?? 'GET',
      path,
      identity: options.identity,
      tool: options.tool ?? '',
      permission: options.permission ?? '',
      body: options.body,
      idempotencyKey: options.idempotencyKey
    });
  }
}

export const SLIMWEB_BACKEND_METHODS = Object.freeze([
  'listSitesForAdminIdentity',
  'resolveAdminSiteForIdentity',
  'selectSiteForAdminIdentity',
  'getBasicSettings',
  'updateBasicSettings',
  'getSiteReadiness',
  'getSiteLaunchProgress',
  'getSeoSettings',
  'updateSeoSettings',
  'getFacebookSettings',
  'updateFacebookSettings',
  'getNotionSettings',
  'updateNotionSettings',
  'getContactSettings',
  'updateContactSettings',
  'getDashboardSummary',
  'getMailDeliverySettings',
  'updateMailDeliverySettings',
  'getMailTemplates',
  'updateMailTemplates',
  'getMailLayout',
  'updateMailLayout',
  'listAdmins',
  'upsertAdmin',
  'deleteAdmin',
  'createNewsletter',
  'listNewsletters',
  'getNewsletter',
  'updateNewsletter',
  'deleteNewsletter',
  'searchNotionPages',
  'getNotionPageContent',
  'createPoster',
  'listCustomerServiceLogs',
  'deleteCustomerServiceLog',
  'getCustomerServiceSettings',
  'updateCustomerServiceSettings',
  'createExport',
  'listAuditLogs',
  'listCategories',
  'upsertCategory',
  'deleteCategory',
  'listNavItems',
  'upsertNavItem',
  'deleteNavItem',
  'listProducts',
  'getProduct',
  'prepareProductImageReference',
  'upsertProduct',
  'deleteProduct',
  'inspectProductImport',
  'validateProductImport',
  'commitProductImport',
  'listArticles',
  'checkArticleTitle',
  'getArticleContent',
  'createArticle',
  'updateArticle',
  'deleteArticle',
  'listPages',
  'checkPageTitle',
  'getPageContent',
  'createPage',
  'updatePage',
  'getPagePreviewUrl',
  'deletePage',
  'createUpload',
  'commitUpload',
  'listThemes',
  'getSiteThemeMode',
  'getDesignContext',
  'updateSiteThemeMode',
  'createThemeFromDefault',
  'activateTheme',
  'deleteTheme',
  'getThemeShellContext',
  'updateThemeRootElements',
  'getThemeStyleProfile',
  'upsertThemeStyleProfile',
  'appendThemeStyleProfileRequest',
  'getMediaLibraryStats',
  'deleteUnusedMedia',
  'registerAsset',
  'listExternalAssets',
  'deleteExternalAsset',
  'updateContentSeo',
  'importChatGptAttachment',
  'getPaymentLogisticsSettings',
  'updatePaymentLogisticsSettings',
  'listCouponTemplates',
  'upsertCouponTemplate',
  'issueMemberCoupon',
  'listMembers',
  'getMember',
  'deleteMember',
  'revokeMemberCoupon',
  'listDiscountCodes',
  'upsertDiscountCode',
  'deleteDiscountCode',
  'listMemberTiers',
  'upsertMemberTier',
  'deleteMemberTier',
  'listThresholdGifts',
  'upsertThresholdGift',
  'deleteThresholdGift',
  'listProductAddOns',
  'upsertProductAddOn',
  'deleteProductAddOn',
  'listOrders',
  'calculateOrderProfitStatistics',
  'getOrder',
  'createOrderLogistics',
  'markOrderShipped',
  'listPendingReturns',
  'createReturnLogistics',
  'cancelReturn',
  'completeReturn',
  'completeRefund',
  'createRefund',
  'updateOrdersStatus',
  'updateOrdersRecipient',
  'deleteOrders',
  'getWaybillUrl',
  'getReturnWaybillUrl'
]);

export function assertSlimWebBackend(backend) {
  for (const method of SLIMWEB_BACKEND_METHODS) {
    if (typeof backend?.[method] !== 'function') {
      throw new TypeError(`SlimWebBackend is missing ${method}().`);
    }
  }

  return backend;
}


