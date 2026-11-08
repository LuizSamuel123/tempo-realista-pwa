# Tempo Realista

> Este projeto foi desenvolvido em colaboração com inteligência artificial (IA), inclusive na geração e revisão de código e documentação.

Aplicativo local de agenda e gerenciamento de tempo, com backend FastAPI,
SQLAlchemy/SQLite e frontend em HTML, CSS e JavaScript com suporte a PWA.

- Agenda diária e mensal com categorias de compromissos.
- Marcos importantes, radar de eventos e registro de adiamentos.
- Calendário de feriados calculado localmente.
- Dados armazenados no computador e recursos offline no navegador.

## Executar no Windows

Requer Python 3.12 ou mais recente. Abra `INICIAR_APP.bat` na raiz do projeto.
Na primeira execução, o assistente instala as dependências e prepara o ambiente
Python. O navegador abre o aplicativo com a chave de acesso local.

Para instalar manualmente na raiz do projeto:

```powershell
python -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\INICIAR_APP.bat
```

O banco e a chave de acesso são criados em `backend/data/` no primeiro uso.
Essa pasta não faz parte do repositório. Os dados guardados no navegador também
permanecem locais. Não compartilhe a URL que contém sua chave de acesso.

## Estrutura

```text
backend/app/     API, modelos e regras do aplicativo
backend/tests/   Testes existentes
frontend/        Interface e recursos da PWA
INICIAR_APP.bat  Inicialização no Windows
```

## Testes

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests
```

## Arquivos locais

O Git acompanha código, documentação e recursos gráficos do aplicativo. O
`.gitignore` usa uma lista de tipos e arquivos permitidos: ambientes virtuais,
caches, fotos de usuários, relatórios, históricos, bancos de dados e chaves
locais não são incluídos. Não use `git add -f` para esses arquivos.
