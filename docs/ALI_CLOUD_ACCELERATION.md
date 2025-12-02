# 使用阿里云加速 Supabase 数据库访问指南

由于 Supabase 的服务器通常位于海外，在中国大陆访问可能会遇到延迟高或连接不稳定的问题。使用阿里云的 **ECS（云服务器）** 作为反向代理是目前最有效且成本可控的加速方案。

## 方案架构
**你的电脑 (国内)**  -->  **阿里云 ECS (香港/新加坡)**  -->  **Supabase (海外)**

利用阿里云香港节点优秀的国际互联带宽，作为跳板转发请求。

---

## 实施步骤

### 第一步：购买阿里云 ECS
1. 登录 [阿里云控制台](https://ecs.console.aliyun.com/)。
2. 购买一台 **ECS 实例**。
   - **地域**: 必须选择 **中国香港** 或 **新加坡** (香港最佳)。
   - **网络**: 分配公网 IPv4 地址。
   - **配置**: 最低配置（如 1核 1G 或 2G）即可满足转发需求。
   - **操作系统**: 推荐 Ubuntu 20.04 或 CentOS 7。

### 第二步：配置 Nginx 反向代理
1. SSH 登录到你的 ECS 服务器。
2. 安装 Nginx:
   ```bash
   # Ubuntu
   sudo apt update
   sudo apt install nginx -y
   
   # CentOS
   sudo yum install nginx -y
   ```
3. 修改 Nginx 配置:
   编辑 `/etc/nginx/nginx.conf` 或 `/etc/nginx/conf.d/default.conf`，添加以下内容：

   ```nginx
   server {
       listen 80;
       server_name _;  # 或者你的域名

       location / {
           # 将此处替换为你的 Supabase URL (去掉 https://)
           proxy_pass https://ziqpiqwvrcfxefwxtusr.supabase.co;
           
           # 关键配置：处理 SSL 握手
           proxy_ssl_server_name on;
           proxy_set_header Host ziqpiqwvrcfxefwxtusr.supabase.co;
           
           # 传递客户端 IP
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```
4. 重启 Nginx:
   ```bash
   sudo systemctl restart nginx
   ```

### 第三步：修改项目配置
回到本项目代码，修改 `src/backend/supabase_config.js`。

将 `SUPABASE_URL` 替换为你的 **阿里云 ECS 公网 IP** (保留 http:// 前缀)。

```javascript
// 原配置
// const SUPABASE_URL = 'https://ziqpiqwvrcfxefwxtusr.supabase.co';

// 新配置 (假设你的 ECS IP 是 47.x.x.x)
const SUPABASE_URL = 'http://47.x.x.x'; 
```

### 第四步：测试
重新运行项目 (`npm run start`)。现在所有的数据库请求都会先发送到阿里云香港服务器，再由它极速转发到 Supabase，速度通常会有显著提升。

---

## 进阶优化 (可选)
如果希望更安全（使用 HTTPS），你可以：
1. 购买一个域名并解析到 ECS IP。
2. 在 ECS 上申请免费的 SSL 证书（如 Let's Encrypt）。
3. 将 Nginx 配置改为监听 443 端口。
