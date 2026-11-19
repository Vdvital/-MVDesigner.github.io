# Catálogo Online

Sistema de catálogos com painel de administrador, painel do cliente e catálogo público. Funciona no GitHub Pages, sem servidor próprio.

| Página | Para quem | O que faz |
| --- | --- | --- |
| `catalogo/index.html` | Todos | Login |
| `catalogo/admin.html` | Administrador | Cria usuários (só o admin), define o tempo de acesso, renova, bloqueia, troca senha e exclui |
| `catalogo/painel.html` | Cliente | Capa, dados da loja, importar/exportar Excel, fotos do Google Drive, editar produtos |
| `catalogo/loja.html?loja=endereco` | Compradores | Catálogo público com abas Produtos/Categorias, busca, promoções com selo pulsante e carrinho que envia o pedido pelo WhatsApp |

## Testar agora (modo local)

Abra `catalogo/index.html` e entre com `admin@catalogo.com` / `admin123`.
No modo local, os dados ficam **apenas no navegador** em que foram criados. Use para testar; para clientes reais, ative o Firebase.

## Tempo de acesso

- Ao criar o usuário, o admin escolhe 7, 30, 90 dias, 6 meses, 1 ano, sem limite, ou uma data final.
- No painel, **Tempo** adiciona dias (a partir do vencimento atual) ou define outra data.
- Vencido ou bloqueado: o cliente não entra, não consegue salvar e o catálogo público mostra "temporariamente fora do ar".

## Planilha do Excel

Colunas reconhecidas (a ordem não importa; só **Código** é obrigatória):
`Código`, `Nome`, `Descrição`, `Categoria`, `Preço`, `Preço promocional`, `Link da imagem`.
Use **Baixar modelo** no painel. Na importação, o cliente escolhe entre atualizar/adicionar ou substituir tudo.
Um produto com preço promocional menor que o preço aparece com o selo **PROMO -X%** pulsando ao lado da foto.

## Fotos pelo Google Drive

1. O cliente coloca as fotos numa pasta do Drive, com o **código** no nome: `1020.jpg`, `1020_2.jpg`, `1020-azul.png`.
2. Compartilha a pasta como **Qualquer pessoa com o link – Leitor**.
3. Cola o link da pasta no painel e clica em **Buscar fotos do Drive**. Subpastas (1 nível) também são lidas.

Para isso funcionar, o administrador precisa de **uma** chave de API do Google:

1. Acesse https://console.cloud.google.com, crie um projeto.
2. Em **APIs e serviços → Biblioteca**, ative **Google Drive API**.
3. Em **Credenciais → Criar credenciais → Chave de API**. Restrinja a chave à Google Drive API e ao seu domínio (`https://SEU-USUARIO.github.io/*`).
4. Cole a chave em `catalogo/config.js`, no campo `googleApiKey`.

## Ativar o Firebase (dados na nuvem)

1. Crie um projeto em https://console.firebase.google.com.
2. **Authentication → Método de login → E-mail/senha**: ativar.
3. **Authentication → Usuários → Adicionar usuário**: crie o administrador com o mesmo e-mail de `admins` em `config.js`.
4. **Firestore Database → Criar banco de dados** (modo produção).
5. **Firestore → Regras**: cole o conteúdo de `firestore.rules`, troque `admin@catalogo.com` pelo seu e-mail de admin e publique.
6. **Configurações do projeto → Seus apps → Web (</>)**: copie o objeto de configuração para `firebase` em `config.js`.
7. Em **Authentication → Configurações → Domínios autorizados**, adicione `SEU-USUARIO.github.io`.
8. Em `config.js`, mude `modo` para `"firebase"`.

No modo Firebase, a troca de senha é feita por e-mail de redefinição. Cada catálogo é salvo num único documento (limite de ~1 MB, o suficiente para milhares de produtos e uma capa comprimida).

## Carrinho e categorias

- **Aba Categorias:** mostra um cartão por categoria (com a foto de um produto, quantidade de itens e quantos estão em promoção). Ao tocar, abre os produtos daquela categoria.
- **Carrinho:** o comprador adiciona produtos pelo botão **+ Adicionar** ou pela página do produto (com quantidade). O carrinho fica salvo no aparelho dele, mostra o total e envia o pedido completo para o WhatsApp da loja, com nome, itens, quantidades, valores e observação.
- O botão do carrinho só funciona se a loja tiver o WhatsApp cadastrado no painel.
