# Kombistível — Combustível e Despesas do Veículo

PWA (Progressive Web App) para controle de **todos os gastos do veículo**: abastecimentos e consumo médio (km/l), custo por quilômetro, custo total do veículo e análise de viabilidade **Etanol × Gasolina**. Além do combustível, registra aquisição, documentação, IPVA, licenciamento, seguro, revisões, manutenção, peças, serviços, pneus, multas e outros gastos, com resumo por categoria. Funciona 100% offline, com todos os dados salvos exclusivamente no armazenamento local do dispositivo (`localStorage` + backup durável silencioso em `IndexedDB`) e backup manual completo via arquivo JSON (o CSV é apenas exportação parcial para análise).

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
- Registro de despesas do veículo por categoria: aquisição, documentação, IPVA, licenciamento, seguro, revisão, manutenção, peças, serviços, pneus, multas, estacionamento/pedágio, lavagem e outros.
- Indicadores automáticos: consumo médio, R$/km combinado, gasto com combustível, despesas e custo total do veículo.
- Comparação automática entre Etanol e Gasolina usando consumo **real** do veículo.
- Gráficos de evolução do consumo e gastos mensais (combustível + despesas + aquisição).
- Suporte a múltiplos veículos.
- Dados salvos somente no dispositivo (`localStorage` + backup em `IndexedDB`), sem conta ou nuvem.

## Funcionalidades

### Painel (Dashboard)
- Filtros combináveis por **veículo** e **período** (30 dias, 90 dias, ano atual, histórico completo), compartilhados com a aba Despesas.
- KPIs: consumo médio (km/l), custo por km (combustível + despesas de uso), gasto com combustível (com litros abastecidos), despesas e **custo total do veículo** no período.
- Card **Etanol × Gasolina** com veredito, barra comparativa, paridade de equilíbrio e vantagem estimada.
- Gráfico de linha da evolução do consumo (km/l por ciclo de tanque cheio).
- Gráfico de barras empilhadas dos gastos mensais: combustível, despesas e aquisição.

### Despesas do veículo
- Nova aba **Despesas**, com filtros de veículo e período sincronizados com o painel.
- Cadastro/edição/exclusão de despesas com veículo, categoria, data, valor, descrição, KM opcional e observações.
- Categorias: aquisição do veículo, documentação/transferência, IPVA, licenciamento/vistoria, seguro, revisão, manutenção/mecânica, peças, serviços/mão de obra, pneus, multas, estacionamento/pedágio, lavagem/estética e outros.
- Resumo do **custo total do veículo** (combustível + despesas de uso + aquisição) e do custo por km no período.
- Card **Para onde foi o dinheiro**: quebra das despesas por categoria, com valor, percentual e grupo (Aquisição, Documentos, Manutenção, Outros).
- Lista de despesas do mais recente ao mais antigo, com edição e exclusão.
- Exportação das despesas em **CSV**.

### Novo abastecimento
- Seleção de veículo existente ou cadastro inline (marca, modelo, ano, combustível padrão).
- Tipo de combustível: Etanol, Gasolina ou Diesel.
- Máscara monetária em BRL nos campos de preço e total pago.
- Cálculo automático: informa *total pago* → calcula litros; informa *litros* → calcula total.
- Validações: KM não pode ser inferior à última registrada do veículo, data válida, preço > 0.
- Ao **editar** um abastecimento anterior, a KM é validada entre os registros vizinhos (anterior e próximo) na ordem cronológica — corrigir apenas valor/digitação não é bloqueado por um registro posterior com KM maior.
- Sugestão automática do combustível padrão do veículo selecionado.
- Flag **Tanque cheio**, usada para calcular o km/l com precisão.
- Campo opcional de posto com autocomplete (datalist alimentado pelos postos já usados).

### Histórico
- Lista ordenada do mais recente ao mais antigo, com contagem.
- Edição e exclusão (com diálogo de confirmação) de cada registro.
- Botões de exportação JSON (backup completo) / CSV (abastecimentos) e importação.
- Botão **Salvar agora**, que sincroniza o backup local manualmente a qualquer momento.

### Armazenamento e backup
- Todos os dados (veículos + abastecimentos + despesas) ficam salvos exclusivamente no dispositivo — sem conta, sem nuvem.
- **`localStorage`** (chave `kombistivel.v1`): leitura instantânea e volume interno do app. Estrutura `{ vehicles, records, expenses, savedAt }`.
- **`IndexedDB`** (banco `kombistivel-db`, store `profile`): **backup durável silencioso**. A cada gravação o estado é espelhado automaticamente, sem permissões ou prompts.
- Na abertura, o app concilia as duas fontes pelo `savedAt` mais recente — a mais atual vence e sincroniza a outra. Assim, limpar o cache do Service Worker não apaga os dados: eles são restaurados do `IndexedDB` e o `localStorage` é recriado sozinho.
- Indicador discreto **"Backup automático ativo · última sincronização …"** logo abaixo dos botões de backup na aba Histórico.
- Backups manuais adicionais: botão **Salvar agora** (força a sincronização do backup local) e exportação de arquivo, com restauração pelo botão **Importar**:
  - **JSON** (`kombistivel-backup-*.json`): backup completo — contém veículos, abastecimentos e despesas.
  - **CSV** (`kombistivel-abastecimentos-*.csv` e `kombistivel-despesas-*.csv`): exportações parciais, apenas para análise/planilha — não substituem o backup completo em JSON.

> Limpar apenas o *cache* (Cache API/Service Worker) não afeta o `IndexedDB`. Limpar "dados de sites/navegação" completos apaga também `localStorage` e `IndexedDB` — nesse cenário, use o backup **JSON** exportado.

### PWA
- Banner de instalação (Android/desktop via `beforeinstallprompt` e instruções manuais para iOS).
- Badge "Offline" no cabeçalho quando sem conexão.

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Front-end | HTML5, CSS3 e JavaScript vanilla (ES6+, sem build) |
| Gráficos | [Chart.js 4.4.1](https://www.chartjs.org/) carregado sob demanda via CDN (jsDelivr) |
| Armazenamento | `localStorage` (dados do app) + `IndexedDB` (backup durável silencioso) |
| PWA | Manifest + Service Worker próprio (cache manual) |
| Hospedagem | GitHub Pages (qualquer servidor estático) |

> Não há gerenciador de pacotes nem processo de build: todas as dependências de runtime são carregadas por CDN.

## Estrutura do projeto

```
Kombistivel/
├── index.html            # Única página (SPA simples): dashboard, abastecimento, despesas, histórico, modais
├── styles.css            # Estilos globais (tema escuro, cards, gráficos, modais, toasts)
├── app.js                # Toda a lógica da aplicação (armazenamento local, cálculos, UI)
├── manifest.json         # Manifest PWA (nome, ícones, cores, display standalone)
├── service-worker.js     # Cache offline (versão atual: kombistivel-v12)
├── icons/                # Favicon, ícones PWA (192/512) e versões maskable
└── .github/
    └── workflows/
        └── deploy.yml    # CI/CD: publica automaticamente no GitHub Pages a cada push na main
```

### Seções do `app.js`

| Seção | Responsabilidade |
|---|---|
| Storage | Leitura/gravação no `localStorage` (chave `kombistivel.v1`) |
| Backup silencioso | `IndexedDB` (`kombistivel-db`): espelhamento automático e conciliação na inicialização |
| Helpers | Parsing numérico pt-BR, máscara BRL, escape de HTML, formatação de datas |
| Cálculos analíticos | Enriquecimento de registros (ciclos/km-l), filtros, KPIs, custos combinados, viabilidade |
| Dashboard | Renderização dos KPIs, card de viabilidade e gráficos |
| Histórico | Renderização da lista de abastecimentos |
| Despesas | Categorias, filtros, resumo por categoria, lista, CRUD e CSV |
| Formulário | Veículos (selects), vínculo preço↔litros↔total, validações e submissão |
| CRUD histórico | Exclusão com confirmação |
| Edição de veículo | Modal de edição de ficha do veículo |
| Exportação/Importação | JSON completo (veículos, abastecimentos e despesas) e CSV parcial (abastecimentos e despesas) |
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

### Despesa (`expenses[]`)

```json
{
  "id": "exp456",
  "createdAt": "2025-01-20T12:00:00.000Z",
  "vehicleId": "abc123",
  "dateISO": "2025-01-20",              // data (YYYY-MM-DD)
  "category": "revisao",               // aquisicao | documentacao | ipva | licenciamento | seguro | revisao | manutencao | pecas | servicos | pneus | multas | estacionamento | lavagem | outros
  "value": 890.00,
  "km": 30000,                         // opcional
  "description": "Revisão dos 30.000 km",
  "notes": "Óleo, filtro de óleo e velas" // opcional
}
```

### Armazenamento local

- **`localStorage`** — chave `kombistivel.v1`, estrutura `{ vehicles, records, expenses, savedAt }`.
- **`IndexedDB`** — banco `kombistivel-db`, object store `profile` (chave `main`), mesma estrutura `{ vehicles, records, expenses, savedAt }`. Funciona como backup durável silencioso e independe do cache do Service Worker.
- Dados salvos por versões anteriores (sem `expenses`) são carregados normalmente; o campo é inicializado como lista vazia.

## Cálculos e regras de negócio

### Ciclo de tanque cheio (km/l)

Por veículo, os registros são ordenados por data/KM. O consumo é medido **entre dois abastecimentos com tanque cheio** (o litro acumulado no intervalo dividido pela distância). Se nenhum registro tiver a flag *tanque cheio*, cada registro é tratado como limite de ciclo próprio (fallback aproximado). O resultado é armazenado em um mapa enriquecido por ID de registro (`enrichedMap`).

### Consumo médio (KPI)

Média ponderada global: `Σ(distância dos ciclos) ÷ Σ(litros dos ciclos)` dentro do filtro aplicado.

### Custo por km

**Combustível + despesas de uso:** `(Σ total pago em combustível + Σ despesas de uso) ÷ Σ distância entre abastecimentos consecutivos`.

- Despesas de uso = todas as despesas **exceto aquisição do veículo** (documentação, IPVA, revisões, peças, serviços etc.).
- A aquisição é somada apenas no **custo total do veículo**, pois distorce o custo por km rodado.
- Distância só é considerada quando o odômetro cresce em relação ao abastecimento anterior.

### Custo total do veículo

`Σ combustível + Σ despesas (incluindo aquisição)` dentro do filtro de veículo/período.

### Resumo por categoria

As despesas são agrupadas por categoria e ordenadas do maior para o menor valor, com percentual sobre o total de despesas. Para a barra visual, cada categoria pertence a um grupo: **Aquisição**, **Documentos**, **Manutenção** ou **Outros**.

### Gastos mensais

O gráfico soma, por mês, combustível + despesas de uso + aquisição em barras empilhadas, permitindo comparar o custo real de cada mês.

### Viabilidade Etanol × Gasolina

1. **Paridade de equilíbrio**: se existirem ciclos completos com os dois combustíveis, usa-se a razão dos consumos reais (`km/l etanol ÷ km/l gasolina`). Caso contrário, aplica-se a clássica **regra dos 70%** (`0,70`).
2. **Razão de preços**: `preço etanol ÷ preço gasolina` (últimos preços registrados).
3. **Veredito**: etanol compensa se `razão de preços ≤ paridade`; a vantagem é `|razão − paridade| ÷ paridade`.

## PWA e funcionamento offline

- **Manifest**: display `standalone`, tema `#0b0f14`, ícones normais e maskable.
- **Service Worker** (`kombistivel-v12`):
  - *Install*: pré-cache dos assets essenciais (HTML, CSS, JS, manifest, ícones).
  - *Activate*: remove caches antigos e assume as páginas imediatamente (`clients.claim`).
  - *Fetch*:
    - Assets do app (navegações, scripts, estilos): **network-first** com fallback ao cache.
    - Demais recursos (CDNs, fontes, imagens): **cache-first** com atualização em background (stale-while-revalidate).
- **Chart.js** é carregado sob demanda e fica em cache após a primeira visita — os gráficos funcionam offline depois disso.

> Ao alterar assets, incremente `CACHE_NAME` em `service-worker.js` para invalidar o cache dos clientes.

## Importação e exportação

### Exportar
- **JSON** (`kombistivel-backup-*.json`): estrutura completa `{app, version, exportedAt, vehicles, records, expenses}` — formato oficial para backup/restauração e único que contém **todos** os dados.
- **CSV de abastecimentos** (`kombistivel-abastecimentos-*.csv`): exportação parcial, apenas dos abastecimentos; separador `;` com BOM UTF-8 e colunas `data_iso;veiculo_marca;veiculo_modelo;veiculo_ano;combustivel;km;preco_litro;litros;valor_total;tanque_cheio;posto`.
- **CSV de despesas** (`kombistivel-despesas-*.csv`, aba Despesas): exportação parcial, apenas das despesas; colunas `data;veiculo_marca;veiculo_modelo;veiculo_ano;categoria;descricao;valor;km;observacoes`.

> Os arquivos CSV são recortes para análise e não incluem veículos nem o conjunto completo de dados. Para backup/restauração, use o **JSON** (ou o backup automático em `IndexedDB`).

### Importar
- Aceita `.json` ou `.csv` de abastecimentos (detecta `;` ou `,` como delimitador).
- JSON importa também as despesas. Backups antigos (sem o campo `expenses`) continuam funcionando.
- Deduplicação por `id` de abastecimento, `id` de despesa e `id` de veículo — nada é duplicado em reimportações.
- CSV: veículos são agrupados por marca+modelo+ano (criados automaticamente se novos); colunas obrigatórias: `data_iso`, `combustivel`, `km`.
- Registros inválidos (sem data, valor ou KM quando obrigatório) são ignorados e reportados no resumo final.

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

O projeto é totalmente estático e sem build. Site publicado automaticamente:

**https://andrejoaolopes1979-svg.github.io/Kombistivel/**

### GitHub Actions (já configurado)

O arquivo `.github/workflows/deploy.yml` já está no repositório. A cada `push` na branch `main` o workflow publica a pasta raiz no Pages:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

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

Para ativar: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

> Dica: o nome do arquivo pode ser qualquer um dentro de `.github/workflows/`; o YAML acima é apenas a documentação do que já está versionado.

> Sobre o subcaminho em `<usuario>.github.io/<repositorio>/`:
> - Todos os assets do app usam caminhos **relativos** (`./`, `icons/…`, `service-worker.js`, `manifest.json`), então funcionam normalmente em qualquer subcaminho. Não é preciso ajustar URLs.
> - O Service Worker só funciona em HTTPS ou `localhost` (o GitHub Pages já usa HTTPS).
