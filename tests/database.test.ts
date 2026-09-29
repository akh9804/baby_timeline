import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const db = new PGlite();
const editor = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const child = "33333333-3333-4333-8333-333333333333";
const moment = "44444444-4444-4444-8444-444444444444";
const media = "55555555-5555-4555-8555-555555555555";
const path = `children/${child}/moments/${moment}/${media}.jpg`;
async function asUser<T>(role: string, uid: string, work: () => Promise<T>) {
  await db.exec(`set role ${role}; set request.jwt.claim.sub = '${uid}';`);
  try {
    return await work();
  } finally {
    await db.exec("reset role;");
  }
}
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
  await db.exec(
    readFileSync("supabase/migrations/202609290001_initial.sql", "utf8"),
  );
  await db.exec(
    `insert into auth.users values ('${editor}'),('${stranger}'); insert into public.editors(user_id) values ('${editor}'); insert into public.children(id,name) values ('${child}','아기');`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("PostgreSQL migration and RLS", () => {
  it("blocks anonymous data access and signed-in users outside the allowlist", async () => {
    await asUser("anon", "", async () => {
      await expect(db.query("select * from public.children")).rejects.toThrow(
        /permission denied/,
      );
    });
    await asUser("authenticated", stranger, async () => {
      expect(
        (await db.query("select * from public.children")).rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          `insert into public.moments(child_id,title,occurred_at) values ('${child}','Forbidden',now())`,
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        db.query(`insert into public.editors(user_id) values ('${stranger}')`),
      ).rejects.toThrow(/permission denied/);
    });
  });
  it("allows editor writes and validates storage paths and MIME types", async () => {
    await asUser("authenticated", editor, async () => {
      await db.exec(
        `insert into public.moments(id,child_id,title,occurred_at) values ('${moment}','${child}','첫 순간','2026-09-28T10:00:00+09:00')`,
      );
      await db.exec(
        `insert into storage.objects(bucket_id,name) values ('family-media','${path}')`,
      );
      await expect(
        db.query(
          `insert into storage.objects(bucket_id,name) values ('family-media','arbitrary.jpg')`,
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        db.query(
          `insert into public.media(id,moment_id,type,storage_path,mime_type,file_size) values ('${media}','${moment}','image','wrong/path.jpg','image/jpeg',100)`,
        ),
      ).rejects.toThrow(/Invalid media storage path/);
      await db.exec(
        `insert into public.media(id,moment_id,type,storage_path,mime_type,file_size) values ('${media}','${moment}','image','${path}','image/jpeg',100)`,
      );
      expect((await db.query("select * from public.media")).rows).toHaveLength(
        1,
      );
    });
  });
  it("blocks viewer storage access and mutations", async () => {
    await asUser("authenticated", stranger, async () => {
      expect(
        (await db.query("select * from storage.objects")).rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          `insert into storage.objects(bucket_id,name) values ('family-media','${path}')`,
        ),
      ).rejects.toThrow(/row-level security/);
      expect(
        (await db.query("delete from public.moments returning id")).rows,
      ).toHaveLength(0);
    });
  });
  it("cascades media deletion and durably queues original object cleanup", async () => {
    await asUser("authenticated", editor, async () => {
      await db.exec(`delete from public.moments where id = '${moment}'`);
    });
    expect((await db.query("select * from public.media")).rows).toHaveLength(0);
    expect(
      (
        await db.query<{ storage_path: string }>(
          "select * from public.storage_cleanup",
        )
      ).rows[0].storage_path,
    ).toBe(path);
    expect(
      (
        await db.query<{ public: boolean }>(
          "select public from storage.buckets",
        )
      ).rows[0].public,
    ).toBe(false);
  });
  it("rate limits persistently and does not expose the limiter to browsers", async () => {
    await asUser("authenticated", editor, async () => {
      await expect(
        db.query("select public.consume_access_attempt('test')"),
      ).rejects.toThrow(/permission denied/);
    });
    for (let i = 0; i < 10; i++)
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select public.consume_access_attempt('test') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(true);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select public.consume_access_attempt('test') as allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
});
