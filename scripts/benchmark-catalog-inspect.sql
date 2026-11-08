\set ON_ERROR_STOP on

select count(*)::integer,
       count(distinct slug)::integer,
       md5(string_agg(concat_ws(E'\x1f', slug, name, website_url, tagline,
                                short_description, description), E'\n' order by slug)),
       md5(string_agg(concat_ws(E'\x1f', slug, name, website_url, tagline,
                                short_description, description), E'\n' order by slug)
           filter (where slug between 'sorbench-s75c-p-00001'
                                 and 'sorbench-s75c-p-02000'))
  from public.saas_products
 where slug like 'sorbench-s75c-p-%';
