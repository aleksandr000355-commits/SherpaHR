<?php
declare(strict_types=1);

final class Attention
{
    public function __construct(private PDO $db) {}

    public function forUser(int $userId, ?DateTimeImmutable $clock = null): array
    {
        $now = ($clock ?? new DateTimeImmutable('now', new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('UTC'));
        // Обзор относится к ответственности руководителя проекта, а не к личным
        // назначениям. Проверка членства сохраняет границу доступа обычных карточек.
        $scope = ' FROM tasks t JOIN projects p ON p.id=t.project_id JOIN project_members m ON m.project_id=p.id WHERE m.user_id=? AND p.owner_id=? AND p.archived=0';
        $stmt = $this->db->prepare('SELECT t.*,p.name AS project_name' . $scope . " AND t.status<>'done'");
        $stmt->execute([$userId, $userId]);
        $tasks = $stmt->fetchAll();
        $stmt = $this->db->prepare('SELECT c.*,u.name AS author FROM comments c JOIN users u ON u.id=c.user_id WHERE c.task_id IN (SELECT t.id' . $scope . " AND t.status<>'done') ORDER BY c.id");
        $stmt->execute([$userId, $userId]);
        $comments = [];
        foreach ($stmt->fetchAll() as $comment) $comments[$comment['task_id']][] = $comment;
        $items = [];
        $counts = ['blocked' => 0, 'overdue' => 0, 'request' => 0, 'unassigned' => 0, 'soon' => 0];
        foreach ($tasks as $task) {
            $signals = [];
            $score = 0;
            $add = function(string $code, string $label, int $weight) use (&$signals, &$score, &$counts): void {
                $signals[] = ['code' => $code, 'label' => $label];
                $score = max($score, $weight);
                ++$counts[$code];
            };
            if ($task['status'] === 'blocked') $add('blocked', 'Заблокирована', 100);
            if ($task['due_at'] !== null) {
                $due = new DateTimeImmutable($task['due_at']);
                if ($due < $now) $add('overdue', 'Срок прошёл', 80);
                elseif ($due <= $now->modify('+48 hours')) $add('soon', 'Срок в ближайшие 48 часов', 30);
            }
            if ($task['assignee_id'] === null) $add('unassigned', 'Нет исполнителя', 60);
            $thread = $comments[$task['id']] ?? [];
            $evidence = null;
            foreach ($thread as $comment) {
                // Берём последний подходящий источник, а не только последнюю реплику:
                // технический ответ после просьбы не означает, что помощь уже оказана.
                if (self::isRequest($comment['body'])) $evidence = $comment;
            }
            $descriptionSignal = self::isRequest($task['description']);
            if ($evidence !== null || $descriptionSignal) $add('request', 'Возможная просьба о помощи', 90);
            if (!$signals) continue;
            $task['signals'] = $signals;
            $task['score'] = $score;
            $task['evidence'] = $evidence;
            $task['description_signal'] = $descriptionSignal;
            $task['latest_comment'] = $thread ? $thread[count($thread) - 1] : null;
            $task['comment_count'] = count($thread);
            $items[] = $task;
        }
        usort($items, fn(array $a, array $b) => ($b['score'] <=> $a['score']) ?: (($a['due_at'] ?? '9999') <=> ($b['due_at'] ?? '9999')) ?: ($a['id'] <=> $b['id']));
        return ['items' => $items, 'counts' => $counts, 'server_now' => $now->format('Y-m-d\TH:i:s\Z')];
    }

    public static function isRequest(string $text): bool
    {
        return (bool) preg_match('/(?:нужн[аоы]?\s+(?:помощь|решение\s+руководителя)|помоги(?:те)?\s+(?:определить|решить|выбрать|согласовать|разобраться)|не\s+можем\s+продолжить|без\s+[^.!?\n]{1,70}\s+не\s+продолжить|жд[её]м\s+решения\s+руководителя)/iu', $text);
    }
}
