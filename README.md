# Cotador 3D

Calculadora de preço para peças impressas em 3D. Roda na Cloudflare (Workers + banco D1), sem servidor próprio.

Para cada orçamento, ela soma:

- **Material**: gramas × preço do filamento por kg, com uma porcentagem de sobra de rolo.
- **Máquina**: horas × (energia + depreciação + manutenção) da impressora escolhida.
- **Falhas**: uma porcentagem sobre material + máquina.
- **Mão de obra**: preparação por mesa, montagem por peça e tempo de embalar/atender.
- **Extras**: embalagem, insumos e licença do modelo.

Depois aplica quatro opções de acréscimo (por exemplo 40%, 60%, 80% e 100%) e mostra o preço total, por peça e por kit. Impressoras, filamentos, custos e o histórico de orçamentos ficam salvos no banco.

## Como instalar na sua conta Cloudflare (Windows)

Você precisa de:

- uma conta gratuita na [Cloudflare](https://dash.cloudflare.com/sign-up);
- o [Node.js](https://nodejs.org) instalado (versão LTS).

Passos:

1. Baixe este projeto (botão verde **Code → Download ZIP** no GitHub) e descompacte numa pasta.
2. Dê dois cliques em **`setup.bat`**. Ele instala o necessário, abre o navegador para você autorizar a Cloudflare, cria o banco com dados de exemplo e publica o cotador.
3. No fim, ele mostra o endereço do seu cotador (algo como `https://cotador.SEU-NOME.workers.dev`).
4. **Proteja o endereço com login** (veja abaixo). Sem isso, qualquer pessoa com o link consegue ver e alterar seus dados.
5. Abra o cotador e cadastre suas impressoras, custos e filamentos nas abas da página.

Para publicar uma nova versão depois de alguma alteração, dê dois cliques em **`publicar.bat`**.

## Proteger com login (Cloudflare Access)

A página e os dados não têm login próprio. A proteção é feita pela Cloudflare, que é gratuita para até 50 usuários:

1. No painel da Cloudflare, abra **Zero Trust**. Na primeira vez, escolha um nome de equipe e o plano **Free**.
2. Vá em **Access → Applications → Add an application → Self-hosted**.
3. Em destino, coloque o endereço do seu cotador (o `workers.dev` ou o seu domínio), com o caminho em branco.
4. Crie uma política **Allow** com **Include → Emails** e o seu e-mail (e de quem mais você quiser dar acesso).
5. Salve. Ao abrir o cotador, a Cloudflare vai pedir o e-mail e mandar um código.

Também dá para ligar o Access direto no Worker: **Workers & Pages → cotador → Settings → Domains & Routes → workers.dev → Enable Cloudflare Access**.

## Usar um domínio próprio (opcional)

Se você tem um domínio na mesma conta Cloudflare, edite o `wrangler.jsonc`: tire as barras `//` do bloco `routes`, troque pelo seu subdomínio e mude `"workers_dev"` para `false`. Depois rode `publicar.bat` e proteja o novo endereço no Access.

## Arquivos

| Arquivo | O que é |
|---|---|
| `public/index.html` | A página do cotador, com todos os cálculos |
| `src/worker.js` | O Worker: entrega a página e guarda os dados no banco D1 |
| `schema.sql` | Cria a tabela do banco |
| `seed.sql` | Dados de exemplo (duas impressoras e três filamentos) |
| `wrangler.example.jsonc` | Modelo de configuração; o setup cria o `wrangler.jsonc` a partir dele |
| `setup.bat` / `setup.mjs` | Primeira instalação |
| `publicar.bat` | Publica uma nova versão |

Os arquivos `wrangler.jsonc`, `seed.local.sql` e `*-log.txt` ficam só no seu computador e não vão para o GitHub. Se você criar um `seed.local.sql` com seus próprios dados, o setup usa ele no lugar do `seed.sql`.
