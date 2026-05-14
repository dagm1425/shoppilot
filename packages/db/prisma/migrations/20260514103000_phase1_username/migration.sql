-- Add nullable username for forward-safe registration updates.
ALTER TABLE "users"
ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
