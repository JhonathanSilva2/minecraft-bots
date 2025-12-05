Minecraft Bots – Multi-Instance Architecture (Mineflayer + Pathfinder)

Este projeto implementa uma arquitetura modular e escalável para bots de Minecraft usando Mineflayer, com suporte nativo a:

múltiplos bots simultâneos

IA modular baseada em máquina de estados

comandos via chat

pathfinding inteligente

organização clara em core / brain / commands / modules

ES Modules (Node 20+)

zero estado global (cada bot é independente)

🚀 Como iniciar um bot

Você pode iniciar quantos bots quiser, cada um com seu próprio nome e instância:

node src/index.js Max

Ou simplesmente:

node src/index.js

Se nenhum nome for informado, o bot utilizará o nome padrão Max.

Para rodar múltiplos bots simultaneamente:

node src/index.js Max
node src/index.js Bob
node src/index.js Miner01
node src/index.js Guardiao

Cada bot funciona como um agente totalmente isolado.

🤖 Arquitetura do Projeto
src/
index.js → Ponto de entrada (nenhuma lógica aqui)
utils/
getBotName.js → Leitor seguro do nome via CLI
core/
bot.js → Inicializa cada instância do bot
events.js → Registra eventos e loops (ex.: physicsTick)
brain/
brain.js → Cria o “cérebro” do bot
stateManager.js → Controla estados (enter/update/exit)
states/
idle.js → Estado ocioso
follow.js → Seguir o jogador
gotoPlayer.js → Ir até o jogador uma vez
commands/
commandHandler.js → Roteador de comandos
followCommand.js → !seguir
stopCommand.js → !parar
comeCommand.js → !vir
modules/
(vazio por enquanto) → Navegação, mineração, combate, farm etc.

Cada bot possui:

seu próprio brain

seu próprio stateManager

seu próprio loop (physicsTick)

seus próprios comandos

logs com prefixo do nome do bot

💬 Comandos disponíveis (digitados no chat do Minecraft)
▶ Seguir você continuamente
!seguir

⏹ Parar
!parar

🧍 Vim até você (uma única vez)
!vir

🌐 Requisitos do Servidor

Este bot foi projetado para Minecraft 1.20.6, usando:

Servidor Paper 1.20.6

online-mode=false (para bots non-premium)

Conexão local em localhost:25565

🛠 Instalação das dependências
npm install

Importante: use Node 20.x.x, pois Mineflayer não é totalmente compatível com Node 22.

🔥 Próximas features sugeridas

Modo guarda-costas

Mineração inteligente (scan + pathfinding + inventário)

Farm automático completo

Sistema de baús: guardar, retirar e organizar itens

Construção de estruturas

Rotinas pré-programadas

Bots cooperativos (Max + Bob + Miner01 trabalhando juntos)

📝 Notas finais

Este projeto segue:

arquitetura limpa

princípios do SOLID

módulos independentes

sem variáveis globais

ES Modules

pathfinder importado via default

state machine com enter, update, exit

Perfeito como base para criar agentes Minecraft realmente inteligentes.
