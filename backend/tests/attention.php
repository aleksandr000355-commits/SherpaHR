<?php
declare(strict_types=1);
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Attention.php';
putenv('DB_PATH=:memory:');
putenv('SEED_NOW=2026-11-11T08:00:00Z');
$db = Database::connect();
$service = new Attention($db);
$count = 0;
function expect(bool $ok, string $label): void {
    global $count;
    if (!$ok) throw new RuntimeException('FAIL: ' . $label);
    ++$count; echo 'PASS: ' . $label . PHP_EOL;
}
$result = $service->forUser(1, new DateTimeImmutable('2026-11-11T08:00:00Z'));
expect(array_column($result['items'], 'id') === [5, 1, 7, 2], 'deterministic ranking across three projects');
expect($result['counts']['overdue'] === 2 && $result['counts']['blocked'] === 2, 'counts reflect independent reasons');
expect($result['counts']['request'] === 3, 'text requests are included');
expect(!Attention::isRequest('Помощь не нужна, препятствий нет.'), 'negative message does not trigger a request');
expect(!Attention::isRequest('Макет согласован, препятствий нет.'), 'neutral update does not trigger a request');
expect(Attention::isRequest('Анна, помоги определить ответственного.'), 'direct request recognized');
$db->exec("UPDATE tasks SET due_at='2026-11-11T08:00:00Z', status='open', description='', assignee_id=2 WHERE id=12");
$atDeadline = $service->forUser(1, new DateTimeImmutable('2026-11-11T08:00:00Z'));
$task = array_values(array_filter($atDeadline['items'], fn($t) => $t['id'] === 12))[0];
expect(array_column($task['signals'], 'code') === ['soon'], 'deadline equality is not overdue');
$later = $service->forUser(1, new DateTimeImmutable('2026-11-11T08:00:01Z'));
$task = array_values(array_filter($later['items'], fn($t) => $t['id'] === 12))[0];
expect(array_column($task['signals'], 'code') === ['overdue'], 'overdue evaluated against current clock');
$db->exec("UPDATE tasks SET status='done' WHERE id=7");
expect(!in_array(7, array_column($service->forUser(1)['items'], 'id'), true), 'done removes even text signal');
expect($service->forUser(2)['items'] === [], 'ownership scope is enforced');
echo "PASS: $count attention checks\n";
