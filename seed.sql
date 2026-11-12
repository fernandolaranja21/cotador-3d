-- Dados de exemplo para começar. Troque pelos seus na própria página
-- (abas "Impressoras e custos" e "Filamentos").
-- Se existir um arquivo seed.local.sql, o setup usa ele no lugar deste.
INSERT OR REPLACE INTO docs (col,id,data,updated_at) VALUES ('config','geral','{"acabMin":0,"atendMin":10,"falha":15,"impressoras":[{"acessorios":0,"id":"imp1","manut":0.2,"nome":"Impressora 1","potencia":150,"valor":5000,"vida":10000},{"acessorios":0,"id":"imp2","manut":0.2,"nome":"Impressora 2","potencia":120,"valor":3000,"vida":10000}],"maoObra":30,"margens":[40,60,80,100],"precoPadrao":120,"setupMin":10,"sobra":5,"tarifa":1.1}','2026-01-01T00:00:00.000Z');
INSERT OR REPLACE INTO docs (col,id,data,updated_at) VALUES ('filamentos','f01','{"cor":"Branco","marca":"Marca A","material":"PLA","n":1,"pesoRolo":1000,"precoRolo":110}','2026-01-01T00:00:00.000Z');
INSERT OR REPLACE INTO docs (col,id,data,updated_at) VALUES ('filamentos','f02','{"cor":"Preto","marca":"Marca A","material":"PLA","n":2,"pesoRolo":1000,"precoRolo":110}','2026-01-01T00:00:00.000Z');
INSERT OR REPLACE INTO docs (col,id,data,updated_at) VALUES ('filamentos','f03','{"cor":"Cinza","marca":"Marca B","material":"PETG","n":3,"pesoRolo":1000,"precoRolo":130}','2026-01-01T00:00:00.000Z');
