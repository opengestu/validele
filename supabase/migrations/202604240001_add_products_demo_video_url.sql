-- Add optional demo video url for seller product pages
alter table public.products
add column if not exists demo_video_url text;

comment on column public.products.demo_video_url is 'Optional demo video URL for product presentation.';
