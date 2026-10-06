-- 00011_reel_views.sql
-- View counting for reels.
--
-- The `reels` UPDATE policy only lets a viewer edit their *own* reel, so a
-- normal user can never bump views_count on somebody else's video from the
-- client. Expose one narrow SECURITY DEFINER function instead: it increments
-- the counter and nothing else — it does not hand out general update rights,
-- and it re-applies the same visibility rules as the SELECT policy so private
-- or blocked content cannot be probed through the counter.

create or replace function public.increment_reel_view(p_reel_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.reels r
     set views_count = r.views_count + 1
   where r.id = p_reel_id
     and (
       r.user_id = auth.uid()
       or (
         not public.is_blocked(r.user_id, auth.uid())
         and (
           not exists (
             select 1 from public.profiles p where p.id = r.user_id and p.is_private
           )
           or public.is_follower(r.user_id)
         )
       )
     );
$$;

-- Nobody but the API roles needs it; anon keeps working because the feed
-- itself is readable without a session.
revoke all on function public.increment_reel_view(uuid) from public;
grant execute on function public.increment_reel_view(uuid) to anon, authenticated;
