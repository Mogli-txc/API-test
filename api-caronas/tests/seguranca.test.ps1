# TESTE DE SEGURAN�A - API DE CARONAS

$BaseUrl = "http://localhost:3000"

# Teste 1: Sem token (deve retornar 403)
Write-Host "`n======== TESTE 1: Acesso Negado SEM Token ========`n" -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/caronas/oferecer" `
        -Method POST `
        -ContentType "application/json" `
        -Body (@{
            cur_usu_id = 1
            vei_id = 1
            caro_desc = "Carona teste"
            caro_data = "2026-03-25 08:00"
            caro_vagasDispo = 3
        } | ConvertTo-Json) `
        -ErrorAction Stop

    Write-Host "TESTE 1 FALHOU: Deveria retornar 403, mas retornou $($response.StatusCode)" -ForegroundColor Red
    $teste1 = $false
} catch {
    $statusCode = $_.Exception.Response.StatusCode.Value__
    if ($statusCode -eq 403) {
        Write-Host "TESTE 1 PASSOU: Status 403 recebido (Acesso Negado)" -ForegroundColor Green
        $teste1 = $true
    } else {
        Write-Host "TESTE 1 FALHOU: Esperado 403, recebido $statusCode" -ForegroundColor Red
        $teste1 = $false
    }
}

# Teste 2: Login para obter token
Write-Host "`n======== TESTE 2: Gerar Token JWT (Login) ========`n" -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/usuarios/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body (@{
            usua_email = "admin@escola.com"
            usua_senha = "123456"
        } | ConvertTo-Json)

    $body = $response.Content | ConvertFrom-Json
    
    if ($response.StatusCode -eq 200 -and $body.token) {
        Write-Host "TESTE 2 PASSOU: Token gerado com sucesso!" -ForegroundColor Green
        Write-Host "   Token: $($body.token.Substring(0, 30))..." -ForegroundColor Yellow
        Write-Host "   Usuario: $($body.user.usua_nome) (ID: $($body.user.usua_id))" -ForegroundColor Yellow
        $teste2 = $true
        $token = $body.token
    } else {
        Write-Host "TESTE 2 FALHOU: Status $($response.StatusCode)" -ForegroundColor Red
        $teste2 = $false
        $token = $null
    }
} catch {
    Write-Host "TESTE 2 FALHOU: $($_.Exception.Message)" -ForegroundColor Red
    $teste2 = $false
    $token = $null
}

# Teste 3: Com token valido (deve retornar 201)
Write-Host "`n======== TESTE 3: Acesso Permitido COM Token ========`n" -ForegroundColor Cyan

if ($token) {
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/caronas/oferecer" `
            -Method POST `
            -ContentType "application/json" `
            -Headers @{"Authorization" = "Bearer $token"} `
            -Body (@{
                cur_usu_id = 1
                vei_id = 1
                caro_desc = "Carona de Teste Protegida"
                caro_data = "2026-03-25 08:00"
                caro_vagasDispo = 3
            } | ConvertTo-Json)

        $body = $response.Content | ConvertFrom-Json
        
        if ($response.StatusCode -eq 201 -and $body.carona) {
            Write-Host "TESTE 3 PASSOU: Carona criada com sucesso!" -ForegroundColor Green
            Write-Host "   ID da Carona: $($body.carona.caro_id)" -ForegroundColor Yellow
            Write-Host "   Descricao: $($body.carona.caro_desc)" -ForegroundColor Yellow
            Write-Host "   Status: $($body.carona.caro_status)" -ForegroundColor Yellow
            $teste3 = $true
        } else {
            Write-Host "TESTE 3 FALHOU: Status $($response.StatusCode)" -ForegroundColor Red
            $teste3 = $false
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.Value__
        Write-Host "TESTE 3 FALHOU: Status $statusCode" -ForegroundColor Red
        $teste3 = $false
    }
} else {
    Write-Host "TESTE 3 PULADO: Token nao disponivel (Teste 2 falhou)" -ForegroundColor Yellow
    $teste3 = $false
}

# Teste 4: Token invalido (deve retornar 401)
Write-Host "`n======== TESTE 4: Token Invalido/Mal-formatado ========`n" -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/caronas/oferecer" `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{"Authorization" = "Bearer token_invalido_123456789"} `
        -Body (@{
            cur_usu_id = 1
            vei_id = 1
            caro_desc = "Teste com token invalido"
            caro_data = "2026-03-25 08:00"
            caro_vagasDispo = 3
        } | ConvertTo-Json) `
        -ErrorAction Stop

    Write-Host "TESTE 4 FALHOU: Deveria retornar 401, mas retornou $($response.StatusCode)" -ForegroundColor Red
    $teste4 = $false
} catch {
    $statusCode = $_.Exception.Response.StatusCode.Value__
    if ($statusCode -eq 401) {
        Write-Host "TESTE 4 PASSOU: Status 401 recebido (Token Invalido)" -ForegroundColor Green
        $teste4 = $true
    } else {
        Write-Host "TESTE 4 FALHOU: Esperado 401, recebido $statusCode" -ForegroundColor Red
        $teste4 = $false
    }
}

# Teste 5: Rota publica (deve retornar 200)
Write-Host "`n======== TESTE 5: Rota Publica (Sem Autenticacao) ========`n" -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/caronas" `
        -Method GET `
        -ContentType "application/json"

    $body = $response.Content | ConvertFrom-Json
    
    if ($response.StatusCode -eq 200) {
        Write-Host "TESTE 5 PASSOU: Rota publica acessada com sucesso!" -ForegroundColor Green
        Write-Host "   Total de caronas retornadas: $($body.caronas.Count)" -ForegroundColor Yellow
        $teste5 = $true
    } else {
        Write-Host "TESTE 5 FALHOU: Status $($response.StatusCode)" -ForegroundColor Red
        $teste5 = $false
    }
} catch {
    Write-Host "TESTE 5 FALHOU: $($_.Exception.Message)" -ForegroundColor Red
    $teste5 = $false
}

# Resumo
Write-Host "`n======== RESUMO DOS TESTES ========`n" -ForegroundColor Cyan

$testes = @($teste1, $teste2, $teste3, $teste4, $teste5)
$passados = ($testes | Where-Object { $_ -eq $true }).Count
$falhados = $testes.Count - $passados

Write-Host "Total de testes: $($testes.Count)"
Write-Host "Testes passados: $passados" -ForegroundColor Green
Write-Host "Testes falhados: $falhados" -ForegroundColor Red

if ($passados -eq $testes.Count) {
    Write-Host "`nTODOS OS TESTES PASSARAM! Seguranca validada com sucesso!`n" -ForegroundColor Green
} else {
    Write-Host "`nAlguns testes falharam. Verifique os detalhes acima.`n" -ForegroundColor Yellow
}
