# Teste de Velocidade (GitHub Pages)

Pagina estatica para medir **ping**, **download** e **upload** direto no navegador, pensada para hospedar no **GitHub Pages**.

## Como funciona

- Nao existe um jeito 100% "Speedtest-like" sem infraestrutura propria (varios servidores + backend).
- Aqui a pagina mede a taxa usando requisicoes `fetch` para um servidor publico (Cloudflare) que expoe endpoints de teste com CORS.

## Publicar no GitHub Pages

1. Suba este repositorio para o GitHub.
2. Em **Settings > Pages**, selecione:
   - Source: `Deploy from a branch`
   - Branch: `main` (ou `master`)
   - Folder: `/ (root)`

Abra a URL do Pages e clique em **Iniciar**.
