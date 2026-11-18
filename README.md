# 🎧 Drive2Telegram • Envio de Áudios e Audiolivros para o Telegram

Um aplicativo web moderno, rápido e sem dependências externas pesadas, desenvolvido para listar capítulos de áudio de uma pasta do **Google Drive** e enviá-los diretamente para um chat, canal ou grupo do **Telegram** através do seu próprio bot da **Telegram Bot API**.

---

## ✨ Funcionalidades

- **Zero Dependências de Terceiros**: Feito em Node.js puro utilizando os novos recursos nativos (`fetch`, `FormData`, `Blob`). Inicia instantaneamente com `node server.js`.
- **Escaner Automático de Pastas Públicas**: Carrega todos os arquivos da pasta do Google Drive (`1y1VfI8OhAn_Uh44ogwDdYEBkCzCHnp07`) sem requisições lentas.
- **Player de Áudio no Navegador**: Ouça a prévia do capítulo em streaming antes de decidir enviar.
- **Edição Fácil de Títulos**: Personalize o nome de cada faixa ou capítulo direto na tela com 1 clique.
- **Envio Individual ou em Lote**: Envie um capítulo de cada vez ou marque todos e deixe a fila processar automaticamente.
- **Player Nativo do Telegram**: Os arquivos são enviados no formato `sendAudio`, o que permite ao ouvinte no Telegram usar o player nativo (com controle de velocidade 1x, 1.5x, 2x, pausa e barra de progresso).
- **Proteção contra Flood / Rate Limit**: Intervalo configurável entre envios para respeitar as diretrizes da API do Telegram.
- **Logs em Tempo Real**: Terminal visual com Server-Sent Events (SSE) mostrando o download e envio em tempo real.

---

## 🚀 Como Iniciar

1. Abra o terminal na pasta do projeto:
   ```bash
   cd "/home/talison/Documentos/Audio book/ebook telegram"
   ```

2. Inicie o servidor:
   ```bash
   npm start
   # ou
   node server.js
   ```

3. Abra no navegador:
   ```
   http://localhost:3000
   ```

---

## ⚙️ Passo a Passo para Configurar o Telegram

### 1. Criar seu Bot no Telegram
1. No Telegram, procure por **`@BotFather`**.
2. Envie o comando `/newbot`.
3. Escolha um nome de exibição (ex: *Audiolivros Bot*).
4. Escolha um nome de usuário que termine em `bot` (ex: *meu_audiobook_123_bot*).
5. O BotFather enviará um **Token HTTP API** no formato:
   `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxx`
6. Cole esse token no campo **Token do Bot Telegram** na página de configurações do site.

### 2. Obter o Chat ID de Destino
- **Se você quer receber os áudios no seu próprio privado:**
  1. Procure pelo seu bot no Telegram e clique em **Começar** (`/start`).
  2. Para descobrir o seu ID numérico, converse com o bot **`@userinfobot`** no Telegram. Ele responderá com o seu `Id` (ex: `123456789`).
  3. Cole esse número no campo **Chat ID** no site.

- **Se você quer enviar para um Canal ou Grupo:**
  1. Crie o canal ou grupo no Telegram.
  2. Adicione o seu bot como **Administrador** (com permissão de publicar mensagens).
  3. Para canais públicos, o Chat ID é o username público (ex: `@meucanal`).
  4. Para canais privados, o Chat ID é o número negativo que começa com `-100` (ex: `-100192837465`).

### 3. Testar a Conexão
- No site, clique no botão **"Testar Bot & Enviar Msg de Teste"**.
- Se tudo estiver certo, o site confirmará a conexão e enviará uma mensagem de teste imediata!

---

## 📁 Pasta do Google Drive Configurada

O site já vem com a pasta indicada configurada:
- **Link:** `https://drive.google.com/drive/folders/1y1VfI8OhAn_Uh44ogwDdYEBkCzCHnp07?usp=sharing`
- **Conteúdo detectado:** 12 capítulos de audiolivro em formato MP3 (aprox. 18 MB cada).

> **Atenção:** O Telegram Bot API possui um limite de upload de **50 MB** por arquivo para bots. Todos os áudios desta pasta têm entre 15 e 20 MB, portanto estão perfeitamente dentro do limite suportado.

---

## 🛠️ Personalização das Legendas e Narrador

Na seção de configurações, você pode definir:
- **Nome do Narrador / Performer**: Aparece nos metadados do player do Telegram (ex: `Narrador do pica-pau`).
- **Modelo de Legenda**: Suporta `{title}` e `{filename}` (ex: `🎧 {title} | Filosofias da Afirmação e da Negação`).
- **Intervalo entre envios**: Padrão de 2 segundos.

