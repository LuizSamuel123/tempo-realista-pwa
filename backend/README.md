# Tempo Realista

PWA local de gerenciamento de tempo, construída com FastAPI, SQLAlchemy,
SQLite e frontend Vanilla. Não usa APIs externas, bibliotecas de interface ou
notificações push.

## Arquitetura

```text
tempo-realista-pwa/
├── backend/
│   ├── app/
│   │   ├── database.py      # SQLite local e sessão SQLAlchemy
│   │   ├── enums.py         # semântica de cores, marcos e motivos
│   │   ├── models.py        # entidades persistidas
│   │   ├── schemas.py       # contratos e validações Pydantic
│   │   ├── main.py          # API FastAPI e inicialização anual
│   │   └── services/
│   │       ├── calendar.py  # Páscoa, móveis e segundos domingos
│   │       └── domain.py    # rollover, radar e trajetos
│   ├── data/                # banco criado na primeira execução
│   ├── tests/               # regras críticas do domínio
│   └── requirements.txt
├── frontend/                # HTML, CSS e JavaScript puros
└── INICIAR_APP.bat          # atalho principal
```

## Executar no Windows

No PowerShell, na raiz do projeto:

```powershell
python -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn app.main:app --app-dir backend --reload
```

Abra `http://127.0.0.1:8000`. A documentação da API fica em
`http://127.0.0.1:8000/docs`.

Para rodar os testes:

```powershell
cd backend
python -m pytest tests
cd ..
```

## Regras já protegidas pelo código

- Vermelho exige data e não aceita rollover.
- Verde e amarelo aceitam rollover, sempre com um dos quatro motivos.
- Amarelo pode ficar sem data no pool.
- Marcos pretos são separados e o radar mostra somente 0 a 20 dias inteiros.
- E-mails importantes têm antecedência limitada a 3–7 dias no modelo.
- Feriados são calculados offline e inseridos de forma idempotente.
- Aniversários guardam apenas dia e mês.
- Trajetos aceitam chegada após a meia-noite.
- O service worker só mantém cache local; não contém eventos de push.

## Próximos módulos

A fundação deixa preparados os campos de antecedência do e-mail. A entrega
silenciosa deve ser implementada como uma fila local e um adaptador SMTP
configurável pelo próprio usuário, sem API de terceiros. Também faltam as telas
CRUD completas, o modal do Log da Sinceridade e a agenda diária.
