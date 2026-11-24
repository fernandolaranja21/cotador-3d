# Cotador 3D

Plataforma para quem vende impressão 3D: cotador de preço, catálogo de produtos e kits, controle da linha de produção e área para vendedores. Roda na Cloudflare (Workers + banco D1), sem servidor próprio.

## O que tem

| Página | Para quê |
|---|---|
| **Cotador** | Calcula o preço de uma encomenda (material, máquina, falhas, mão de obra, extras) com quatro opções de acréscimo. Agora também salva o resultado como **produto do catálogo** ou cria um **pedido** direto. |
| **Catálogo** | **Produtos**: cada peça com o custo por peça calculado pelas mesmas regras do cotador, preço de venda avulso e preço “dentro de kit” (sem embalagem individual). **Kits**: junte produtos (ex.: bandeja + 3 enfeites de Natal); o custo soma peças, embalagem, insumos e tempo de montar, e o preço sai pela margem escolhida, arredondado (ex.: R$ 49,90). Mostra lucro, quanto o cliente economiza em relação a comprar avulso, horas e gramas de impressão. Dá para digitar um preço-alvo e ver se dá lucro. |
| **Pedidos** | Quadro da linha de produção: *Novo · aguardando pagamento → Confirmado → Imprimindo → Acabamento → Pronto → Entregue*. Cada pedido tem pagamentos (sinal, restante), prazo, contadores de peças feitas e mensagem pronta para copiar e mandar ao cliente no WhatsApp. A aba **O que imprimir** soma as peças de todos os pedidos confirmados — kits viram as peças que os compõem — agrupadas por filamento, com mesas, horas, gramas e a estimativa de dias de impressora. |
| **Vendedores** | Cadastro de quem vende para você (comissão e desconto máximo), relatório de comissões, dados da loja (Pix, sinal, rodapé das mensagens), embalagens para kits montados na hora e controle de quem é administrador. |
| **Área do vendedor** | O que o vendedor vê: catálogo com foto e preço de venda, botão “copiar oferta” para o WhatsApp, **montador de kit** com preço na hora, carrinho com desconto limitado e envio do pedido, e “meus pedidos” com a comissão. O vendedor **nunca vê custos nem margens**: o servidor só entrega o catálogo publicado e recalcula os preços dos pedidos dele. |

### Exemplo: kits de Natal

1. No **Cotador**, calcule cada peça (bandeja, árvore, estrela, boneco) e use “Salvar como produto do catálogo”. Ou crie direto em Catálogo → “+ Novo produto” com gramas, horas e peças por mesa.
2. Em **Catálogo → Kits**, crie “Kit Natal bandeja + 3 enfeites”, clique nos produtos, informe embalagem, laço e minutos de montagem, escolha o acréscimo e marque “Publicar”.
3. A pessoa que vende abre a **Área do vendedor**, copia a oferta para o WhatsApp ou monta um kit diferente na hora (as peças entram com o preço “dentro de kit” + a embalagem escolhida) e envia o pedido.
4. O pedido aparece em **Pedidos** como “aguardando pagamento”. Registre o sinal, avance para “Confirmado” e veja em **O que imprimir** quantas mesas de cada peça faltam.

Quando você muda o preço de um filamento ou um custo, o Catálogo avisa quais preços publicados ficaram diferentes e publica os novos com um clique.

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

A plataforma não tem login próprio. A proteção é feita pela Cloudflare, que é gratuita para até 50 usuários:

1. No painel da Cloudflare, abra **Zero Trust**. Na primeira vez, escolha um nome de equipe e o plano **Free**.
2. Vá em **Access → Applications → Add an application → Self-hosted**.
3. Em destino, coloque o endereço do seu cotador (o `workers.dev` ou o seu domínio), com o caminho em branco.
4. Crie uma política **Allow** com **Include → Emails** e o seu e-mail.
5. Salve. Ao abrir o cotador, a Cloudflare vai pedir o e-mail e mandar um código.

Também dá para ligar o Access direto no Worker: **Workers & Pages → cotador → Settings → Domains & Routes → workers.dev → Enable Cloudflare Access**.

### Administradores e vendedores

Depois do login funcionando:

1. Abra **Vendedores → Acesso** e clique em **Adicionar meu e-mail**. A partir daí só os administradores listados veem custos, catálogo completo e todos os pedidos, e a plataforma passa a conferir a assinatura do login em cada acesso.
2. Cadastre cada vendedor em **Vendedores** (nome, e-mail, comissão, desconto máximo).
3. Só então inclua o e-mail do vendedor na política do Access (passo 4 acima). Ao entrar, ele cai direto na Área do vendedor.

Enquanto nenhum administrador estiver cadastrado (modo aberto), quem passa pelo login e não é vendedor entra como administrador, como na versão anterior.

Se você usa dois endereços (`workers.dev` e domínio próprio), proteja os dois no Access ou desligue o `workers.dev`.

## Usar um domínio próprio (opcional)

Se você tem um domínio na mesma conta Cloudflare, edite o `wrangler.jsonc`: tire as barras `//` do bloco `routes`, troque pelo seu subdomínio e mude `"workers_dev"` para `false`. Depois rode `publicar.bat` e proteja o novo endereço no Access.

## Arquivos

| Arquivo | O que é |
|---|---|
| `public/index.html` | Cotador |
| `public/catalogo.html` | Produtos e kits |
| `public/pedidos.html` | Linha de produção, o que imprimir e lista de pedidos |
| `public/vendedores.html` | Vendedores, comissões, loja e acesso |
| `public/vendedor.html` | Área do vendedor |
| `public/core.js` | Cálculos de custo e preço, dados e menu, usados por todas as páginas |
| `public/app.css` | Visual compartilhado |
| `src/worker.js` | O Worker: entrega as páginas, guarda os dados no D1 e separa o que admin e vendedor podem ver |
| `schema.sql` | Cria a tabela do banco |
| `seed.sql` | Dados de exemplo (duas impressoras e três filamentos) |
| `wrangler.example.jsonc` | Modelo de configuração; o setup cria o `wrangler.jsonc` a partir dele |
| `setup.bat` / `setup.mjs` | Primeira instalação |
| `publicar.bat` | Publica uma nova versão |

Os arquivos `wrangler.jsonc`, `seed.local.sql` e `*-log.txt` ficam só no seu computador e não vão para o GitHub. Se você criar um `seed.local.sql` com seus próprios dados, o setup usa ele no lugar do `seed.sql`.

**Atualizando a partir da versão anterior:** basta rodar `publicar.bat`. O banco continua o mesmo (uma tabela de documentos); produtos, kits, pedidos e vendedores entram nela como novas coleções.
