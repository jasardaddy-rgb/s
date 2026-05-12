# 海龟汤 V5 整合包

这是一个纯前端版本的海龟汤小游戏，已接入免费本地 AI 模型。

## 特性

- 极速模型：`onnx-community/Qwen2.5-0.5B-Instruct`
- 极速模式：短输出、短提示、超时自动回退到规则引擎
- 聊天式裁判界面
- 模型失败时自动回退到规则引擎

## 运行方式

建议使用本地静态服务器打开，例如：

```bash
python3 -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000
```

## 文件

- `index.html`
- `styles.css`
- `script.js`
- `ai-core.js`
- `data.js`
