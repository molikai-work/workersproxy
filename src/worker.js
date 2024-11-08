/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// 代理地址
const upstream = 'gravatar.com'
// 移动设备代理地址
const upstream_mobile = 'gravatar.com'

// 排除特定的地区访问，国家的二位字母代码
const blocked_region = ['XX']

// 排除特定的 IP 地址访问
const blocked_ip_address = ['0.0.0.0', '127.0.0.1']

// 启用 HTTP 重定向 HTTPS
const https = true

// 启用缓存
const disable_cache = false

const replace_dict = {
  '$upstream': '$custom_domain',
  '//gravatar.com': ''
}

// 监听 fetch 事件
addEventListener('fetch', event => {
  event.respondWith(fetchAndApply(event.request));
})

// 处理请求并应用相应的逻辑
async function fetchAndApply(request) {
  const region = request.headers.get('cf-ipcountry')?.toUpperCase();
  const ip_address = request.headers.get('cf-connecting-ip');
  const user_agent = request.headers.get('user-agent');

  let url = new URL(request.url);
  let url_host = url.host;

  // 重定向 HTTPS
  if (https === true && url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.href);
  }

  // 根据设备类型选择域名
  const upstream_domain = await isMobileDevice(user_agent) ? upstream_mobile : upstream;
  url.host = upstream_domain;

  // 阻止特定地区或 IP 地址的访问
  if (blocked_region.includes(region)) {
    return new Response('Access denied: WorkersProxy is not available in your region yet.', { status: 403 });
  } else if (blocked_ip_address.includes(ip_address)) {
    return new Response('Access denied: Your IP address is blocked by WorkersProxy.', { status: 403 });
  }

  // 创建新的请求头
  let new_request_headers = new Headers(request.headers);
  new_request_headers.set('Host', upstream_domain);
  new_request_headers.set('Referer', url.href);

  // 获取原始响应
  let original_response = await fetch(url.href, {
    method: request.method,
    headers: new_request_headers
  });

  // 克隆原始响应并处理响应头
  let original_response_clone = original_response.clone();
  let response_headers = new Headers(original_response.headers);
  response_headers.set('access-control-allow-origin', '*');
  response_headers.set('access-control-allow-credentials', 'true');
  response_headers.delete('content-security-policy');
  response_headers.delete('content-security-policy-report-only');
  response_headers.delete('clear-site-data');

  // 定义缓存策略
  if (disable_cache === false) {
    response_headers.set('Cache-Control', 'no-store');
  }

  // 替换响应文本中的特定内容
  let response_body = null;
  const content_type = response_headers.get('content-type');
  if (content_type && content_type.includes('text/html') && content_type.includes('UTF-8')) {
    response_body = await replaceResponseText(original_response_clone, upstream_domain, url_host);
  } else {
    response_body = original_response_clone.body;
  }
 
  // 返回新的响应
  return new Response(response_body, {
    status: original_response.status,
    headers: response_headers
  });
}

// 替换响应文本中的特定内容
async function replaceResponseText(response, upstream_domain, host_name) {
  let text = await response.text();

  for (let [key, value] of Object.entries(replace_dict)) {
    let re = new RegExp(key.replace('$upstream', upstream_domain).replace('$custom_domain', host_name), 'g');
    text = text.replace(re, value.replace('$upstream', upstream_domain).replace('$custom_domain', host_name));
  }

  return text;
}

// 检查是否为移动设备
async function isMobileDevice(user_agent_info) {
  const mobile_agents = ["Android", "iPhone", "SymbianOS", "Windows Phone", "iPad", "iPod"];
  return mobile_agents.some(agent => user_agent_info.includes(agent));
}
