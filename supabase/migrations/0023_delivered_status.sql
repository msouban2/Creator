-- 0023_delivered_status.sql
-- Makes "delivered" a first-class application status so barter/paid orders show a
-- distinct Delivered stage (between Product Shipped and content creation) in both
-- the admin panel and the creator app.
-- NOTE: run this on its own; new enum values can't be used in the same
-- transaction that adds them.

alter type application_status add value if not exists 'delivered' after 'product_shipped';
