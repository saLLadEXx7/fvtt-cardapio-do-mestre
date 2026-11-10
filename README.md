# Cardápio do Capitão — Foundry VTT v14 / D&D 5e

## Instalação / atualização
1. Faça backup do mundo.
2. Extraia a pasta `cardapio-do-capitao` em `Data/modules/`, substituindo a versão anterior.
3. Reinicie o Foundry e confirme que o módulo está habilitado.
4. Entre como Mestre. A atualização substitui o catálogo de exemplo antigo pelo cardápio correto e, se o estoque estiver vazio, cadastra uma unidade de cada um dos oito produtos no **Baú do Grupo**.

## Produtos incluídos
- 1. Espuma do Kraken — 25 PO
- 2. Hidromel das Marés — 50 PO
- 3. Licor da Sereia — 30 PO
- 4. Vinho de Algas Douradas — 75 PO
- 6. Carapaça Crocante — 90 PO
- 7. Ensopado dos Sete Mares — 70 PO
- 8. Peixe do Farol — 35 PO
- 9. Baiacu Flamejante — 65 PO

O número 5 foi mantido ausente, conforme a imagem original. Cada item inclui descrição, efeito e preço no texto do documento Item. O estoque inicial é de uma unidade por produto.

## Baú compartilhado
O Mestre cria ou reutiliza o ator **Baú do Grupo**, com permissão padrão de proprietário para os jogadores, e o Container **Estoque do Cardápio**. Os itens são sincronizados como documentos Item no ator e associados ao Container. Os preços são apenas informativos: nenhuma moeda é descontada automaticamente.

## Importante sobre os benefícios
Esta atualização corrige o cadastro dos oito produtos e seu preenchimento automático no baú. Os benefícios estão registrados nas descrições dos itens. A aplicação automática de todos os efeitos especiais (bônus no próximo teste, inspiração, recuperação de espaços de magia e ação bônus) ainda depende de integração específica com a versão exata do sistema D&D 5e e deve ser validada separadamente; não considere todos esses efeitos automatizados apenas por instalar esta versão.

## Compatibilidade
Versão experimental para Foundry VTT v14 e sistema D&D 5e. Faça o primeiro teste em uma cópia do mundo. Se os itens aparecerem fora do Container, informe a versão exata do sistema D&D 5e e envie uma captura da ficha do Baú do Grupo.


### Imagens dos produtos (v0.4.0)
As oito ilustrações estão incluídas em `assets/items/` e são carregadas diretamente pelo módulo. Ao iniciar como Mestre, o módulo atualiza os caminhos de imagem dos oito produtos já cadastrados e sincroniza as imagens no inventário do Baú do Grupo.


### Versão 0.4.1
- Adicionada uma ilustração própria para o Container “Estoque do Cardápio”, armazenada em `assets/estoque-do-cardapio.webp`.


## v0.4.3
- Itens do estoque configurados como consumíveis com Activity **Usar**.
- A Activity usa um alvo de consumo `ammo` apontado para o próprio item, para solicitar a redução de uma unidade da quantidade do inventário quando usada.
- Ao atualizar itens existentes, a Activity e o alvo são reconstruídos.
