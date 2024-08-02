// script.js

const apiBaseUrl = 'http://192.168.1.120:7770';

document.addEventListener('DOMContentLoaded', () => {
    const buscarFuncionarioSelects = document.querySelectorAll('#buscar-funcionario');
    buscarFuncionarioSelects.forEach(select => {
        select.addEventListener('change', handleFuncionarioChange);
    });

    if (document.getElementById('status')) {
        document.getElementById('status').addEventListener('change', toggleCampos);
    }

    if (document.getElementById('form-registro-presenca')) {
        document.getElementById('form-registro-presenca').addEventListener('submit', registrarPresenca);
    }

    if (document.getElementById('form-registro-funcionario')) {
        document.getElementById('form-registro-funcionario').addEventListener('submit', registrarFuncionario);
    }

    if (document.getElementById('form-exportar')) {
        document.getElementById('form-exportar').addEventListener('submit', exportarPresencas);
    }

    // Tema
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');

    const currentTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.add(currentTheme === 'dark' ? 'dark-mode' : '');
    themeIcon.classList.add(currentTheme === 'dark' ? 'fa-moon' : 'fa-sun');

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');

        if (document.body.classList.contains('dark-mode')) {
            themeIcon.classList.replace('fa-sun', 'fa-moon');
            localStorage.setItem('theme', 'dark');
        } else {
            themeIcon.classList.replace('fa-moon', 'fa-sun');
            localStorage.setItem('theme', 'light');
        }
    });

    carregarFuncionarios();
});

function handleFuncionarioChange() {
    const funcionarioId = this.value;

    // Limpar tabela de presenças e saldo ao selecionar um novo funcionário
    const tbody = document.getElementById('registros');
    tbody.innerHTML = '<tr><td colspan="6">Nenhum registro encontrado.</td></tr>';

    const saldoExtraDiv = document.getElementById('saldo-extra');
    saldoExtraDiv.textContent = 'R$ 0.00';

    // Carregar presenças e saldo para o funcionário selecionado
    carregarPresencas(funcionarioId);
    carregarSaldoExtra(funcionarioId);
}

function toggleCampos() {
    const status = document.getElementById('status').value;
    const horariosDiv = document.getElementById('horarios');
    horariosDiv.style.display = status === 'Presente' ? 'block' : 'none';

    if (status === 'Ausente') {
        const campos = ['entrada_manha', 'saida_manha', 'entrada_tarde', 'saida_tarde'];
        campos.forEach(campoId => {
            document.getElementById(campoId).value = 'AUSENTE';
        });
    }
}

async function carregarFuncionarios() {
    try {
        console.log('Carregando funcionários...');
        const response = await fetch(`${apiBaseUrl}/funcionarios`);
        
        if (!response.ok) {
            throw new Error(`Erro ao buscar funcionários: ${response.status} ${response.statusText}`);
        }

        const funcionarios = await response.json();
        console.log('Funcionários carregados:', funcionarios);

        const buscarFuncionarioSelects = document.querySelectorAll('#buscar-funcionario');
        buscarFuncionarioSelects.forEach(select => {
            select.innerHTML = '<option value="" disabled selected>Selecionar Funcionário</option>'; // Limpar opções anteriores
            funcionarios.forEach(funcionario => {
                console.log(`Adicionando funcionário: ${funcionario.nome}`); // Log para verificação
                const option = document.createElement('option');
                option.value = funcionario.id;
                option.textContent = funcionario.nome;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('Erro ao carregar funcionários:', error);
        exibirMensagem('Erro ao carregar funcionários.', 'erro');
    }
}

async function registrarPresenca(event) {
    event.preventDefault();

    const funcionarioId = document.getElementById('buscar-funcionario').value;
    const data = document.getElementById('data').value;
    const status = document.getElementById('status').value;

    const entradaManha = status === 'Ausente' ? 'AUSENTE' : document.getElementById('entrada_manha').value;
    const saidaManha = status === 'Ausente' ? 'AUSENTE' : document.getElementById('saida_manha').value;
    const entradaTarde = status === 'Ausente' ? 'AUSENTE' : document.getElementById('entrada_tarde').value;
    const saidaTarde = status === 'Ausente' ? 'AUSENTE' : document.getElementById('saida_tarde').value;

    try {
        const response = await fetch(`${apiBaseUrl}/presencas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ funcionario_id: funcionarioId, data, entrada_manha: entradaManha, saida_manha: saidaManha, entrada_tarde: entradaTarde, saida_tarde: saidaTarde, status })
        });

        if (response.ok) {
            const data = await response.json();
            exibirMensagem('Presença registrada com sucesso!');
            carregarPresencas(funcionarioId);
            carregarSaldoExtra(funcionarioId);
            document.getElementById('form-registro-presenca').reset();
        } else {
            console.error('Erro ao registrar presença:', response.statusText);
            exibirMensagem('Erro ao registrar presença.', 'erro');
        }
    } catch (error) {
        console.error('Erro ao registrar presença:', error);
        exibirMensagem('Erro ao registrar presença.', 'erro');
    }
}

async function registrarFuncionario(event) {
    event.preventDefault();

    const nome = document.getElementById('novo-funcionario').value.trim();
    console.log(`Tentando registrar funcionário: ${nome}`);

    try {
        const response = await fetch(`${apiBaseUrl}/funcionarios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nome })
        });

        if (response.ok) {
            exibirMensagem(`Funcionário ${nome} registrado com sucesso!`);
            document.getElementById('novo-funcionario').value = '';

            // Atualiza a lista de funcionários
            await carregarFuncionarios();
        } else {
            console.error('Erro ao registrar funcionário:', response.statusText);
            exibirMensagem('Erro ao registrar funcionário.', 'erro');
        }
    } catch (error) {
        console.error('Erro ao registrar funcionário:', error);
        exibirMensagem('Erro ao registrar funcionário.', 'erro');
    }
}

async function exportarPresencas(event) {
    event.preventDefault();

    const funcionarioId = document.getElementById('buscar-funcionario').value;
    const inicio = document.getElementById('inicio').value;
    const fim = document.getElementById('fim').value;
    const todos = document.getElementById('todos-dias').checked;

    console.log(`Exportando presenças para o funcionário ${funcionarioId} de ${inicio} a ${fim}, incluir todos: ${todos}`);

    try {
        const response = await fetch(`${apiBaseUrl}/exportar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ funcionario_id: funcionarioId, inicio, fim, todos })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'presencas.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            exibirMensagem('Presenças exportadas com sucesso!');
        } else {
            console.error('Erro ao exportar presenças:', response.statusText);
            exibirMensagem('Erro ao exportar presenças.', 'erro');
        }
    } catch (error) {
        console.error('Erro ao exportar presenças:', error);
        exibirMensagem('Erro ao exportar presenças.', 'erro');
    }
}

async function carregarPresencas(funcionarioId) {
    try {
        const response = await fetch(`${apiBaseUrl}/presencas/${funcionarioId}`);
        if (!response.ok) {
            throw new Error(`Erro ao carregar presenças: ${response.status} ${response.statusText}`);
        }
        const presencas = await response.json();

        const tbody = document.getElementById('registros');
        tbody.innerHTML = ''; // Limpa a tabela antes de adicionar novos registros

        if (presencas.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6">Nenhum registro encontrado.</td>';
            tbody.appendChild(row);
        } else {
            presencas.forEach(presenca => {
                const ausenteClass = presenca.status === 'Ausente' ? 'ausente' : '';
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${presenca.data}</td>
                    <td class="${ausenteClass}">${presenca.entrada_manha}</td>
                    <td class="${ausenteClass}">${presenca.saida_manha}</td>
                    <td class="${ausenteClass}">${presenca.entrada_tarde}</td>
                    <td class="${ausenteClass}">${presenca.saida_tarde}</td>
                    <td class="${ausenteClass}">${presenca.status}</td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar presenças:', error);
        exibirMensagem('Erro ao carregar presenças.', 'erro');
    }
}

async function carregarSaldoExtra(funcionarioId) {
    try {
        const response = await fetch(`${apiBaseUrl}/funcionarios/${funcionarioId}`); 
        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.status} ${response.statusText}`);
        }
        const funcionario = await response.json();

        const saldoExtraDiv = document.getElementById('saldo-extra');
        saldoExtraDiv.textContent = `R$ ${funcionario.saldo_extra.toFixed(2)}`; 
    } catch (error) {
        console.error('Erro ao carregar saldo extra:', error);
        exibirMensagem('Erro ao carregar saldo extra.', 'erro');
    }
}

function exibirMensagem(mensagem, tipo = 'sucesso') {
    const mensagemDiv = document.createElement('div');
    mensagemDiv.textContent = mensagem;
    mensagemDiv.classList.add('mensagem', tipo);
    document.body.appendChild(mensagemDiv);

    setTimeout(() => {
        mensagemDiv.remove();
    }, 5000); 
}
