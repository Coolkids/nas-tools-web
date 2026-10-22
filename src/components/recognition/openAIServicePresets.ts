import type { OpenAIOptions } from '@/api/recognition'

export const openAIServicePresets: Record<OpenAIOptions['service_type'], { label: string; base_url: string; model: string; help: string }> = {
  compatible: { label: '其他 OpenAI 兼容服务', base_url: '', model: '', help: '使用 Chat Completions 接口。自动协商 JSON 格式与 Token 参数，也可在高级设置中固定参数。' },
  ollama: { label: 'Ollama', base_url: 'http://localhost:11434/v1', model: '', help: '填写已安装的 Ollama 模型名，例如 qwen3:8b。本地服务通常无需密钥；容器部署请将 localhost 改为服务可达地址。' },
  llama_cpp: { label: 'llama.cpp', base_url: 'http://localhost:8080/v1', model: '', help: '填写 llama-server 加载的模型名或 --alias。自动使用 llama.cpp 的 Schema 格式；未开启认证时可不填密钥。' },
  deepseek: { label: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-flash', help: '自动使用 JSON Object 与 max_tokens，并关闭思考以控制文件名提取耗时。可填写账号可用的其他 DeepSeek 模型。' }
}

export function applyOpenAIServiceAddress(options: OpenAIOptions): OpenAIOptions {
  const preset = openAIServicePresets[options.service_type]
  return { ...options, base_url: preset.base_url || options.base_url, model: options.model.trim() ? options.model : preset.model }
}
