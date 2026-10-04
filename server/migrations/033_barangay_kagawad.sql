-- The Sangguniang Barangay, and a barangay that issues its own accounts.
--
-- A kagawad is elected. They legislate, they sit on committees, they answer to
-- the people who voted for them — and none of that is clerical work. So this is
-- not "an officer with fewer tabs": it is a different kind of account, and the
-- routes it may reach live on their own router rather than inside the clerk's
-- with exceptions carved out of it. One forgotten gate on a shared router is
-- the blotter in a councillor's hands, and a gate is exactly the thing somebody
-- forgets a year from now. See server/src/routes/barangayKagawad.ts.
alter type user_role add value if not exists 'barangay_kagawad';
