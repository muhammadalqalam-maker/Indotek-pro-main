-- Keep legacy resource-price permissions compatible with existing memberships.
-- RPC upsert_resource_price already authorizes site_engineer, but app_role enum lacked it.
alter type public.app_role add value if not exists 'site_engineer' after 'site_manager';
