-- Barangay announcements.
--
-- This is the first thing the barangay tier has that is *meant* to reach
-- residents. The blotter and the register are the barangay's own books and are
-- deliberately unreadable outside its console; an announcement is the opposite —
-- a notice has no value until the people it is about have seen it.
--
-- So the containment here is not secrecy, it is relevance: a resident sees the
-- announcements of the barangay they live in and no other, because a water
-- interruption two barangays away is noise that teaches people to stop reading.

create type announcement_kind as enum (
  'general',
  -- Something is off, or will be: water, power, a road closed.
  'service',
  -- A typhoon, an evacuation, an outbreak. The one that may ring a phone.
  'emergency',
  'health',
  -- An assembly, a fiesta, a clean-up, a vaccination day.
  'event'
);

create table barangay_announcements (
  id          uuid primary key default gen_random_uuid(),
  barangay_id text not null references barangays(id) on delete cascade,

  kind        announcement_kind not null default 'general',
  title       text not null,
  body        text not null,

  /*
   * Urgent is the only thing in this table that touches a resident's phone, and
   * it is restricted to the barangay administrator for that reason. An app that
   * lets anybody ring every phone in the barangay is an app whose notifications
   * get turned off, and then the one that mattered goes unread.
   */
  urgent      boolean not null default false,

  /*
   * When it stops being worth reading. A notice about Tuesday's water
   * interruption at the top of the list in December is how a board of notices
   * becomes something nobody looks at. Null means it stands until withdrawn.
   */
  expires_at  timestamptz,

  -- Withdrawn rather than deleted: "what was that notice that said the water
  -- would be off?" is a question somebody asks after it is taken down.
  archived_at timestamptz,

  posted_by   uuid references users(id) on delete set null,
  -- Kept beside the id rather than joined at read time, so a clerk who leaves
  -- does not erase who put a notice up — the same rule the municipal audit log
  -- follows.
  posted_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The resident's read: one barangay, live only, newest first with the urgent
-- ones lifted.
create index barangay_announcements_live_idx
  on barangay_announcements (barangay_id, archived_at, created_at desc);
