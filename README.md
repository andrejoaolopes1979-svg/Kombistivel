# Kombistível — Controle de Combustível

PWA (Progressive Web App) para controle de abastecimentos, consumo médio (km/l), custo por quilômetro e análise de viabilidade **Etanol × Gasolina**. Funciona 100% offline, com todos os dados salvos exclusivamente no armazenamento local do dispositivo (`localStorage`) e backup manual via arquivo JSON.

---

## Índice

1. [Visão geral](#visão-geral)
2. [Funcionalidades](#funcionalidades)
3. [Stack tecnológica](#stack-tecnológica)
4. [Estrutura do projeto](#estrutura-do-projeto)
5. [Modelo de dados](#modelo-de-dados)
6. [Cálculos e regras de negócio](#cálculos-e-regras-de-negócio)
7. [PWA e funcionamento offline](#pwa-e-funcionamento-offline)
8. [Importação e exportação](#importação-e-exportação)
9. [Executando o projeto](#executando-o-projeto)
10. [Deploy](#deploy)

---

## Visão geral

O Kombistível é um aplicativo web leve (sem build, sem framework) voltado para motoristas que querem acompanhar a saúde financeira e o desempenho dos seus veículos:

- Registro de abastecimentos com odômetro, preço, litros e posto.
- Indicadores automáticos: consumo médio, R$/km, gasto total e litros abastecidos.
- Comparação automática entre Etanol e Gasolina usando consumo **real** do veículo.
- Gráficos de evolução do consumo e gastos mensais.
- Suporte a múltiplos veículos.
- Dados salvos somente no dispositivo (`localStorage`), sem conta ou nuvem.

## Funcionalidades

### Painel (Dashboard)
- Filtros combináveis por **veículo** e **período** (30 dias, 90 dias, ano atual, histórico completo).
- KPIs: consumo médio (km/l), custo por km (R$/km), gasto total e litros abastecidos no período.
- Card **Etanol × Gasolina** com veredito, barra comparativa, paridade de equilíbrio e vantagem estimada.
- Gráfico de linha da evolução do consumo (km/l por ciclo de tanque cheio).
- Gráfico de barras dos gastos mensais.

### Novo abastecimento
- Seleção de veículo existente ou cadastro inline (marca, modelo, ano, combustível padrão).
- Tipo de combustível: Etanol, Gasolina ou Diesel.
- Máscara monetária em BRL nos campos de preço e total pago.
- Cálculo automático: informa *total pago* → calcula litros; informa *litros* → calcula total.
- Validações: KM não pode ser inferior à última registrada do veículo, data válida, preço > 0.
- Sugestão automática do combustível padrão do veículo selecionado.
- Flag **Tanque cheio**, usada para calcular o km/l com precisão.
- Campo opcional de posto com autocomplete (datalist alimentado pelos postos já usados).

### Histórico
- Lista ordenada do mais recente ao mais antigo, com contagem.
- Edição e exclusão (com diálogo de confirmação) de cada registro.
- Botões de exportação JSON / CSV e importação.

### Armazenamento e backup
- Todos os dados (veículos + abastecimentos) ficam salvos exclusivamente no `localStorage` do navegador — sem conta, sem nuvem.
- Chave única: `kombistivel.v1`, estrutura `{ vehicles, records, savedAt }`.
- Backups são feitos manualmente pelos botões **JSON/CSV** da aba Histórico (download de arquivo) e restaurados pelo botão **Importar**.

### PWA
- Banner de instalação (Android/desktop via `beforeinstallprompt` e instruções manuais para iOS).
- Badge "Offline" no cabeçalho quando sem conexão.

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Front-end | HTML5, CSS3 e JavaScript vanilla (ES6+, sem build) |
| Gráficos | [Chart.js 4.4.1](https://www.chartjs.org/) carregado sob demanda via CDN (jsDelivr) |
| Armazenamento | `localStorage` (apenas no dispositivo) |
| PWA | Manifest + Service Worker próprio (cache manual) |
| Hospedagem | GitHub Pages (qualquer servidor estático) |

> Não há gerenciador de pacotes nem processo de build: todas as dependências de runtime são carregadas por CDN.

## Estrutura do projeto

```
Kombistivel/
├── index.html            # Única página (SPA simples): dashboard, formulário, histórico, modais
├── styles.css            # Estilos globais (tema escuro, cards, gráficos, modais, toasts)
├── app.js                # Toda a lógica da aplicação (armazenamento local, cálculos, UI)
├── manifest.json         # Manifest PWA (nome, ícones, cores, display standalone)
├── service-worker.js     # Cache offline (versão atual: kombistivel-v10)
└── icons/                # Favicon, ícones PWA (192/512) e versões maskable
```

### Seções do `app.js`

| Seção | Responsabilidade |
|---|---|
| Storage | Leitura/gravação no `localStorage` (chave única `kombistivel.v1`) |
| Helpers | Parsing numérico pt-BR, máscara BRL, escape de HTML, formatação de datas |
| Cálculos analíticos | Enriquecimento de registros (ciclos/km-l), filtros, KPIs, viabilidade |
| Dashboard | Renderização dos KPIs, card de viabilidade e gráficos |
| Histórico | Renderização da lista de abastecimentos |
| Formulário | Veículos (selects), vínculo preço↔litros↔total, validações e submissão |
| CRUD histórico | Exclusão com confirmação |
| Edição de veículo | Modal de edição de ficha do veículo |
| Exportação/Importação | JSON e CSV (exportador e parser CSV próprio) |
| UI geral | Troca de views, modais de confirmação, toasts, badge offline |
| PWA | Registro do Service Worker e banner de instalação |
| Eventos / Boot | Ligação de todos os listeners e carregamento inicial dos dados locais |

## Modelo de dados

### Veículo (`vehicles[]`)

```json
{
  "id": "abc123",
  "marca": "Fiat",
  "modelo": "Argo 1.0",
  "ano": 2020,
  "combustivel": "gasolina" // gasolina | etanol | flex | diesel
}
```

### Abastecimento (`records[]`)

```json
{
  "id": "xyz789",
  "createdAt": "2025-01-15T12:00:00.000Z",
  "vehicleId": "abc123",
  "dateISO": "2025-01-15T09:30",      // datetime-local
  "km": 45200,                        // odômetro
  "fuelType": "gasolina",             // etanol | gasolina | diesel
  "pricePerLiter": 6.19,
  "liters": 40.123,
  "totalValue": 248.36,
  "fullTank": true,
  "station": "Posto Shell BR-101"     // opcional
}
```

### Armazenamento local

- Chave única: `kombistivel.v1`.
- Estrutura: `{ vehicles, records, savedAt }`.

## Cálculos e regras de negócio

### Ciclo de tanque cheio (km/l)

Por veículo, os registros são ordenados por data/KM. O consumo é medido **entre dois abastecimentos com tanque cheio** (o litro acumulado no intervalo dividido pela distância). Se nenhum registro tiver a flag *tanque cheio*, cada registro é tratado como limite de ciclo próprio (fallback aproximado). O resultado é armazenado em um mapa enriquecido por ID de registro (`enrichedMap`).

### Consumo médio (KPI)

Média ponderada global: `Σ(distância dos ciclos) ÷ Σ(litros dos ciclos)` dentro do filtro aplicado.

### Custo por km

`Σ(total pago dos registros com distância conhecida) ÷ Σ(distância entre abastecimentos consecutivos)`.

> Distância só é considerada quando o odômetro cresce em relação ao abastecimento anterior.

### Viabilidade Etanol × Gasolina

1. **Paridade de equilíbrio**: se existirem ciclos completos com os dois combustíveis, usa-se a razão dos consumos reais (`km/l etanol ÷ km/l gasolina`). Caso contrário, aplica-se a clássica **regra dos 70%** (`0,70`).
2. **Razão de preços**: `preço etanol ÷ preço gasolina` (últimos preços registrados).
3. **Veredito**: etanol compensa se `razão de preços ≤ paridade`; a vantagem é `|razão − paridade| ÷ paridade`.

## PWA e funcionamento offline

- **Manifest**: display `standalone`, tema `#0b0f14`, ícones normais e maskable.
- **Service Worker** (`kombistivel-v10`):
  - *Install*: pré-cache dos assets essenciais (HTML, CSS, JS, manifest, ícones).
  - *Activate*: remove caches antigos e assume as páginas imediatamente (`clients.claim`).
  - *Fetch*:
    - Assets do app (navegações, scripts, estilos): **network-first** com fallback ao cache.
    - Demais recursos (CDNs, fontes, imagens): **cache-first** com atualização em background (stale-while-revalidate).
- **Chart.js** é carregado sob demanda e fica em cache após a primeira visita — os gráficos funcionam offline depois disso.

> Ao alterar assets, incremente `CACHE_NAME` em `service-worker.js` para invalidar o cache dos clientes.

## Importação e exportação

### Exportar
- **JSON**: estrutura completa `{app, version, exportedAt, vehicles, records}` — formato oficial para backup/restauração.
- **CSV**: separador `;` com BOM UTF-8 e colunas `data_iso;veiculo_marca;veiculo_modelo;veiculo_ano;combustivel;km;preco_litro;litros;valor_total;tanque_cheio;posto`.

### Importar
- Aceita `.json` ou `.csv` (detecta `;` ou `,` como delimitador).
- Deduplicação por `id` de registro e `id` de veículo — nada é duplicado em reimportações.
- CSV: veículos são agrupados por marca+modelo+ano (criados automaticamente se novos); colunas obrigatórias: `data_iso`, `combustivel`, `km`.
- Registros inválidos (sem data ou KM) são ignorados e reportados no resumo final.

## Executando o projeto

Não há build. Qualquer servidor estático serve a pasta raiz:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Abra `http://localhost:8080`.

> O Service Worker exige HTTPS ou `localhost`.

## Deploy (GitHub Pages)

O projeto é totalmente estático e sem build. Basta publicar a pasta raiz:

### Opção 1 — GitHub Actions (recomendada)

Crie `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - uses: actions/deploy-pages@v4
```

Em **Settings → Pages**, defina *Source* como **GitHub Actions**.

### Opção 2 — Branch `gh-pages`

```bash
git add .
git commit -m "Deploy"
git push
git subtree push --prefix . origin gh-pages
```

Em **Settings → Pages**, defina *Source* como **Deploy from a branch** → `gh-pages`.

> Observações para deploy em `<usuario>.github.io/<repositorio>/`:
> - Se o app for servido em um subcaminho, ajuste as URLs dos assets (ex.: `service-worker.js` e `manifest.json`) ou use um domínio próprio em **Settings → Pages → Custom domain**.
> - O Service Worker só funciona em HTTPS ou `localhost` (o GitHub Pages já usa HTTPS).
