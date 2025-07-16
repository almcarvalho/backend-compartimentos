import cors from 'cors';
import express from 'express';
require('dotenv').config();
const dated = require('date-and-time');
import { parseISO } from 'date-fns';
import axios from 'axios';
import { Console } from 'console';

//tokens de acesso
var mercadoPagoToken = process.env.MP_TOKEN;


const PORT: string | number = process.env.PORT || 5001;

const app = express();

app.use(cors());

app.use(express.json());

//funções auxiliares.

//essa função converte pix em pulsos. Ex: 5,39 ela retorna: 5
function converterPixRecebido(valorPix: number) {
    var valorAux = 0;
    var ticket = 1; //caso o ingresso para uma jogada em sua máquina custe 2 reais altere aqui p/ 2
    if (valorPix > 0 && valorPix >= ticket) {
        valorAux = valorPix;
        valorPix = 0;
        //creditos
        var creditos = valorAux / ticket;
        creditos = Math.floor(creditos);
        var pulsos = creditos * ticket;
        var pulsosFormatados = ("0000" + pulsos).slice(-4);
        return pulsosFormatados;
    } else {
        return "0000";
    }
}


//Retorna em segundos o tempo desde a ultima Consulta efetuada em uma máquina.
function tempoOffline(data2: Date): number {
    var data1 = new Date();
    if (!(data1 instanceof Date) || !(data2 instanceof Date)) {
        throw new Error('Datas inválidas');
    }

    // Calcule a diferença em milissegundos
    const diferencaEmSegundos = Math.abs((data2.getTime() - data1.getTime()) / 1000);

    return diferencaEmSegundos;
}


function gerarNumeroAleatorio(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

let numTentativasEstorno = 1;
let idempotencyKeyAnterior = "";

function gerarChaveIdempotente() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let chave = '';

    for (let i = 0; i < 32; i++) {
        chave += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }

    return chave;
}

function esconderString(string: string) {
    const tamanho = string.length;
    let resultado = '';

    for (let i = 0; i < tamanho - 3; i++) {
        resultado += '*';
    }

    resultado += string.substring(tamanho - 3, tamanho);
    return resultado;
}

async function estornar(id: string, token: string, motivoEstorno: string, tamanhoChave = 32) {
    const url = `https://api.mercadopago.com/v1/payments/${id}/refunds`;

    try {
        console.log('********* estornando *****************');
        console.log(`********* Tentativa nª ${numTentativasEstorno} *****************`);
        console.log(id);
        console.log('********* token *****************');
        console.log(esconderString(token));

        let idempotencyKey = gerarChaveIdempotente();

        // Efetuando o estorno
        const response = await axios.post(url, {}, {
            headers: {
                'X-Idempotency-Key': idempotencyKey,
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(response.data);
        console.log("Estorno da operação: " + id + " efetuado com sucesso!")
        numTentativasEstorno = 1;

        // Se a solicitação for bem-sucedida, salve o valor do cabeçalho X-Idempotency-Key para uso futuro
        idempotencyKeyAnterior = response.headers['x-idempotency-key'];

        return response.data;

    } catch (error) {

        console.log("Houve um erro ao tentar efetuar o estorno da operação: " + id);
        console.log("Detalhes do erro: " + error);

        numTentativasEstorno++;

        if (numTentativasEstorno < 20) { // LIMITE DE TENTATIVAS DE ESTORNO
            await estornar(id, token, motivoEstorno, tamanhoChave);
        } else {
            console.log("Após 20 tentativas não conseguimos efetuar o estorno, VERIFIQUE O TOKEN DO CLIENTE!!");
            numTentativasEstorno = 1;

        }

    }
}


//variáveis de controle

var valorDoPixMaquina01 = 0;
var ultimoAcessoMaquina01 = new Date('2023-10-20T17:30:10');
var compartimentoMaquina01 = "00";


//rotas de consulta

app.get("/consulta-maquina01", async (req, res) => {
    var pulsosFormatados = converterPixRecebido(valorDoPixMaquina01); //<<<<<<ALTERAR 

    valorDoPixMaquina01 = 0; //<<<<<<<<<ALTERAR 

    ultimoAcessoMaquina01 = new Date(); //<<<<<<<<<ALTERAR 

    const retornoFinal = "00" + compartimentoMaquina01;

    compartimentoMaquina01 = "00";

    if (pulsosFormatados != "0000") {
        return res.status(200).json({ "retorno": retornoFinal });
    } else {
        return res.status(200).json({ "retorno": "0000" });
    }
});


//rotas de recebimento

app.get("/rota-recebimento-teste", async (req: any, res: any) => {
    try {
        console.log("Novo pix detectado:");

        const valor = req.query.valor;
        const compartimento = req.query.compartimento;

        if (!valor || !compartimento) {
            return res.status(400).json({ error: "Parâmetros 'valor' e 'compartimento' são obrigatórios." });
        }

        // Atribui às variáveis globais, se necessário
        valorDoPixMaquina01 = valor;
        compartimentoMaquina01 = compartimento;

        console.log("Valor recebido:", valorDoPixMaquina01);
        console.log("Compartimento:", compartimentoMaquina01);

        return res.status(200).json({ mensagem: "ok" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Erro interno: " + error });
    }
});



app.post("/rota-recebimento-mercado-pago-joao", async (req: any, res: any) => {
    try {

        //teste de chamada do Mercado Pago
        if (req.query.id === "123456") {
            console.log("Chamada de Teste recebida do Mercado Pago:");
            return res.status(200).json({ "status": "ok" });
        }

        console.log("Novo pix do Mercado Pago:");
        console.log(req.body);

        console.log("id");
        console.log(req.query.id);

        var url = "https://api.mercadopago.com/v1/payments/" + req.query.id;

        // axios.get(url)
        axios.get(url, { headers: { Authorization: `Bearer ${mercadoPagoToken}` } })
            .then(response => {
                //console.log('Response', response.data)
                if (response.data.status != "approved") {
                    console.log("pagamento não aprovado!");
                    return;
                }
                console.log('store_id', response.data.store_id);
                console.log('storetransaction_amount_id', response.data.transaction_amount);

                //creditar de acordo com o store_id (um para cada maq diferente)
                if (response.data.store_id == '72418588') {
                    if (tempoOffline(ultimoAcessoMaquina01) >= 10) {
                        console.log("Efetuando estorno - Máquina Offline!");
                        estornar(req.query.id, mercadoPagoToken!, "Máquina Offline");
                    } else {
                        console.log("Creditando pix na máquina 1. store_id(72418588)")
                        //escolhendo o compartimento pra liberar de acordo com o preço
                        valorDoPixMaquina01 = response.data.transaction_amount;
                        if (response.data.transaction_amount) {
                            switch (response.data.transaction_amount) {
                                case 2.5: //ACIONA O COMPARTIMENTO 01 QUANDO RECEBER R$: 2,50
                                    compartimentoMaquina01 = "01";
                                    break;
                                case 3.5: //ACIONA O COMPARTIMENTO 02 QUANDO RECEBER R$: 3,50
                                    compartimentoMaquina01 = "02";
                                    break;
                                case 10: //ACIONA O COMPARTIMENTO 03 QUANDO RECEBER R$: 10,00
                                    compartimentoMaquina01 = "03";
                                    break;
                                case 12.99: //ACIONA O COMPARTIMENTO 04 QUANDO RECEBER R$: 12,99
                                    compartimentoMaquina01 = "04";
                                    break;
                                default:
                                    compartimentoMaquina01 = "00"; // valor não reconhecido
                                    estornar(req.query.id, mercadoPagoToken!, "Valor Inválido");
                                    console.warn("Valor de transação não mapeado:", response.data.transaction_amount);
                            }

                            console.log("Compartimento definido:", compartimentoMaquina01);
                        }
                    }
                }

                //caso você tenha mais de uma máquina, terá que criar uma nova store



            })
            .catch(e => {
                console.log('Error: ', e.response.data)
            })
    } catch (error) {
        console.error(error);
        return res.status(402).json({ "error": "error: " + error });
    }
    return res.status(200).json({ "mensagem": "ok" });
});


//código escrito por Lucas Carvalho @br.lcsistemas em meados de Julho de 2025...

app.listen(PORT, () => console.log(`localhost:${PORT}`)); 
