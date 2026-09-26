-- 1) En Supabase > Authentication > Users, creá tu usuario administrador
--    usando email y contraseña.
--
-- 2) Después reemplazá TU_EMAIL_AQUI por el email exacto y ejecutá esto
--    en Supabase > SQL Editor:

insert into public.admin_users (user_id)
select id
from auth.users
where email = 'TU_EMAIL_AQUI'
on conflict (user_id) do nothing;

-- 3) Verificación opcional:
select u.email, a.created_at
from public.admin_users a
join auth.users u on u.id = a.user_id;
