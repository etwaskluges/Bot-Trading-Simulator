CREATE VIEW usercount AS
SELECT COUNT(*) AS user_count
FROM auth.users;