#!/usr/bin/env python3
# Usage: python3 scripts/build-catch-up.py supabase/migrations supabase/catch-up.sql
# Builds an idempotent catch-up script from the ordered migrations.
import re, sys, glob, os
src_dir, out = sys.argv[1], sys.argv[2]
parts = []
for path in sorted(glob.glob(os.path.join(src_dir, '*.sql'))):
    s = open(path).read()
    s = re.sub(r'\bcreate table public\.', 'create table if not exists public.', s)
    s = re.sub(r'\bcreate (unique )?index (\w+)', lambda m: f'create {m.group(1) or ""}index if not exists {m.group(2)}', s)
    s = re.sub(r'\bcreate function\b', 'create or replace function', s)
    s = re.sub(r'\badd column (?!if not exists)', 'add column if not exists ', s)
    # Triggers and policies can't be "if not exists": drop and recreate.
    s = re.sub(r'(?m)^create trigger (\w+)\n(\s+(?:before|after)[^\n]*?\bon ([\w.]+))',
               lambda m: f'drop trigger if exists {m.group(1)} on {m.group(3)};\ncreate trigger {m.group(1)}\n{m.group(2)}', s)
    s = re.sub(r'(?m)^create policy ("[^"]+")(\s+on ([\w.]+))',
               lambda m: f'drop policy if exists {m.group(1)} on {m.group(3)};\ncreate policy {m.group(1)}{m.group(2)}', s)
    s = re.sub(r"(insert into public\.achievements[\s\S]*?\);)\n", lambda m: m.group(1)[:-1] + "\non conflict (id) do nothing;\n", s, count=1)
    parts.append(f'-- ═══ {os.path.basename(path)} ═══\n\n{s}')
header = """-- Rivl catch-up: brings any Supabase database up to date with the app.
-- Safe to run on a fresh database, a partly migrated one, or a fully migrated
-- one, and safe to run more than once. Paste all of it into the SQL Editor and Run.
-- (Generated from supabase/migrations/*.sql; those stay the source of truth.)

"""
open(out, 'w').write(header + '\n\n'.join(parts))
