-- 1. 登录 Supabase 控制台 (https://supabase.com/dashboard)
-- 2. 进入 SQL Editor (SQL 编辑器)
-- 3. 运行以下 SQL 语句来更新数据库结构

-- 为 records 表添加 user_id 字段
ALTER TABLE records ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 为 map_records 表添加 user_id 字段
ALTER TABLE map_records ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- (可选) 启用行级安全策略 (RLS)，确保用户只能访问自己的数据
-- 注意：启用 RLS 后，必须配置相应的策略，否则默认无法访问任何数据

-- 启用 RLS
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_records ENABLE ROW LEVEL SECURITY;

-- 删除旧策略以避免重复创建错误
DROP POLICY IF EXISTS "Users can view their own records" ON records;
DROP POLICY IF EXISTS "Users can insert their own records" ON records;
DROP POLICY IF EXISTS "Users can delete their own records" ON records;

DROP POLICY IF EXISTS "Users can view their own map_records" ON map_records;
DROP POLICY IF EXISTS "Users can insert their own map_records" ON map_records;
DROP POLICY IF EXISTS "Users can delete their own map_records" ON map_records;

-- 创建策略：允许用户查看自己的 records
CREATE POLICY "Users can view their own records" ON records
    FOR SELECT USING (auth.uid() = user_id);

-- 创建策略：允许用户插入自己的 records
CREATE POLICY "Users can insert their own records" ON records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 创建策略：允许用户删除自己的 records
CREATE POLICY "Users can delete their own records" ON records
    FOR DELETE USING (auth.uid() = user_id);

-- 创建策略：允许用户查看自己的 map_records
CREATE POLICY "Users can view their own map_records" ON map_records
    FOR SELECT USING (auth.uid() = user_id);

-- 创建策略：允许用户插入自己的 map_records
CREATE POLICY "Users can insert their own map_records" ON map_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 创建策略：允许用户删除自己的 map_records
CREATE POLICY "Users can delete their own map_records" ON map_records
    FOR DELETE USING (auth.uid() = user_id);


-- ==========================================
-- Storage 存储桶策略配置 (解决图片上传 403 错误)
-- ==========================================

-- 确保 'birds' 存储桶存在 (如果未创建，请在 Storage 面板创建，并设为 Public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('birds', 'birds', true)
ON CONFLICT (id) DO NOTHING;

-- 删除旧存储策略
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public viewing" ON storage.objects;
DROP POLICY IF EXISTS "Allow individual update" ON storage.objects;
DROP POLICY IF EXISTS "Allow individual delete" ON storage.objects;

-- 允许认证用户上传图片到 birds 桶
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'birds' );

-- 允许任何人查看 birds 桶的图片 (因为我们需要 getPublicUrl)
CREATE POLICY "Allow public viewing"
ON storage.objects
FOR SELECT
TO public
USING ( bucket_id = 'birds' );

-- 允许用户更新/删除自己的图片 (可选，基于 owner)
CREATE POLICY "Allow individual update"
ON storage.objects
FOR UPDATE
TO authenticated
USING ( bucket_id = 'birds' AND auth.uid() = owner );

CREATE POLICY "Allow individual delete"
ON storage.objects
FOR DELETE
TO authenticated
USING ( bucket_id = 'birds' AND auth.uid() = owner );
