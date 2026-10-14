"""Regression cases for paragraph boundaries; no audio or Whisper is needed."""
import importlib.util
import sys
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "generate_audio_sync", Path(__file__).with_name("generate_audio_sync.py")
)
sync = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = sync
spec.loader.exec_module(sync)


def transcript(*rows):
    return {"segments": [dict(start=start, end=end, text=text)
                         for start, end, text in rows]}


def word_transcript(*rows):
    return {'segments': [dict(start=rows[0][0], end=rows[-1][1],
        text=''.join(row[2] for row in rows),
        words=[dict(start=start, end=end, text=text) for start, end, text in rows])]}


class ParagraphAlignmentTests(unittest.TestCase):
    def align(self, markdown, recording):
        return sync.align_units(sync.parse_text_units(markdown), recording, .55)

    def old_payload(self, markdown, times):
        units = sync.parse_text_units(markdown)
        return {'cues': [dict(start=start,end=end,kind=unit.kind,targetIndex=unit.target_index,
            targetText=unit.normalized[:48],confidence=.95) for unit,(start,end) in zip(units,times)]}

    def test_partial_repair_fixes_supported_start_keeps_unknown_end(self):
        text='今天我们一同来学习神的恩典，思想圣经的教导。愿主赐给我们智慧，让我们在生活中活出美好的见证。'
        old=self.old_payload(text,[(8,30)])
        recording=word_transcript((1,20,text[:-12]))
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),old,recording)
        cue=fixed['cues'][0]
        self.assertEqual(cue['start'],1)
        self.assertEqual(cue['end'],30)
        self.assertTrue(cue['quality']['startVerified'])
        self.assertFalse(cue['quality']['endVerified'])
        self.assertTrue(cue['quality']['reviewRequired'])
        self.assertTrue(any('repair unverified end' in w for w in fixed['alignmentWarnings']))
        self.assertIs(sync.repair_existing_cues(sync.parse_text_units(text),fixed,recording),fixed)

    def test_partial_repair_never_changes_unknown_prefix(self):
        text='亲爱的长辈弟兄姊妹主内平安。今天我们一起来学习神丰富的恩典与怜悯。'
        old=self.old_payload(text,[(1,40)])
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),old,word_transcript((10,30,text[14:])))
        self.assertEqual(fixed['cues'][0]['start'],1)
        self.assertFalse(fixed['cues'][0]['quality']['startVerified'])

    def test_partial_repair_can_bound_old_end_by_verified_next_start(self):
        text='今天我们一同来学习神的恩典，思想圣经中的教导。愿主赐给我们智慧。\n\n现在我们开始讨论第二段正文。'
        old=self.old_payload(text,[(1,20),(20,25)])
        first=sync.parse_text_units(text)[0].text
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),old,word_transcript(
            (1,8,first[:-10]),(10,16,'现在我们开始讨论第二段正文')))
        self.assertEqual(fixed['cues'][1]['start'],10)
        self.assertEqual(fixed['cues'][0]['end'],10)
        self.assertFalse(fixed['cues'][0]['quality']['endVerified'])
        self.assertEqual(fixed['cues'][0]['repair']['endSource'],'next-verified-start')

    def test_partial_repair_preserves_unmatched_old_paragraph(self):
        text='网页额外编辑的摘要。\n\n我们一同感谢神的恩典。'
        old=self.old_payload(text,[(1,4),(8,12)])
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),old,transcript((8,12,'我们一同感谢神的恩典')))
        self.assertEqual([c['targetIndex'] for c in fixed['cues']],[0,1])
        self.assertEqual(fixed['cues'][0]['start'],1)
        self.assertFalse(fixed['cues'][0]['quality']['startVerified'])

    def test_partial_repair_only_adds_fully_supported_missing_cue(self):
        text='网页额外编辑的摘要。\n\n我们一同感谢神的恩典。'
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),{'cues':[]},transcript((8,12,'我们一同感谢神的恩典')))
        self.assertEqual([c['targetIndex'] for c in fixed['cues']],[1])
        self.assertEqual(fixed['repairSummary']['missingTargets'],[0])

    def test_partial_repair_rejects_wrong_target_identity(self):
        text='我们一同感谢神的恩典。'
        old=self.old_payload(text,[(1,4)])
        old['cues'][0]['targetText']='完全不同的文字'
        with self.assertRaisesRegex(ValueError,'identity mismatch'):
            sync.repair_existing_cues(sync.parse_text_units(text),old,transcript((1,4,text)))

    def test_partial_repair_can_remap_unique_exact_text_without_guessing(self):
        text='# 新标题\n\n我们一同感谢神的恩典。'
        old=self.old_payload('我们一同感谢神的恩典。',[(1,4)])
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),old,
            transcript((1,4,'我们一同感谢神的恩典')),remap_targets=True)
        self.assertEqual(fixed['cues'][0]['targetIndex'],1)
        self.assertEqual(fixed['targetMigrations'][0]['previousTargetIndex'],0)

    def test_partial_repair_rejects_ambiguous_or_merged_target_remapping(self):
        old=self.old_payload('我们一同感谢神的恩典。',[(1,4)])
        for text in ('# 标题\n\n我们一同感谢神的恩典。\n\n我们一同感谢神的恩典。',
                     '我们一同感谢。\n\n神的恩典。'):
            with self.assertRaisesRegex(ValueError,'identity mismatch'):
                sync.repair_existing_cues(sync.parse_text_units(text),old,
                    transcript((1,4,'我们一同感谢神的恩典')),remap_targets=True)

    def test_angle_quote_title_is_rendered_text_not_html(self):
        text='我们来唱<<主爱长阔高深>>这首诗歌。'
        unit=sync.parse_text_units(text)[0]
        self.assertIn('主爱长阔高深',unit.text)
        self.assertEqual(sync.clean_markdown('正文<strong>神的恩典</strong>'),'正文 神的恩典')
        old=self.old_payload(text,[(1,8)])
        old['cues'][0]['targetText']=sync.normalize_text(unit.legacy_text)[:48]
        fixed=sync.repair_existing_cues([unit],old,transcript((1,8,text)),remap_targets=True)
        self.assertEqual(fixed['cues'][0]['targetText'],unit.normalized[:48])
        self.assertEqual(fixed['targetMigrations'][0]['previousTargetIndex'],0)

    def test_partial_repair_withholds_replacement_consuming_old_neighbor(self):
        text='网页额外编辑的摘要。\n\n我们一同感谢神的恩典。'
        old=self.old_payload(text,[(10,15),(15,20)])
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),old,transcript((1,4,'我们一同感谢神的恩典')))
        self.assertEqual([(c['start'],c['end']) for c in fixed['cues']],[(10,15),(15,20)])
        self.assertTrue(any('replacement withheld' in w for w in fixed['alignmentWarnings']))

    def test_partial_repair_drops_heading_without_reindexing_body(self):
        text='# 第二章\n\n我们一同感谢神的恩典。'
        old=self.old_payload(text,[(0,1),(1,4)])
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),old,transcript((1,4,'我们一同感谢神的恩典')))
        self.assertEqual([c['targetIndex'] for c in fixed['cues']],[1])
        self.assertEqual(fixed['repairSummary']['headingsRemoved'],1)

    def test_partial_repair_preserves_recording_order_when_body_order_differs(self):
        text='第一段网页摘要。\n\n第二段网页摘要。'
        old=self.old_payload(text,[(10,14),(1,5)])
        old['cues'].reverse()
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),old,
            transcript((1,5,'其他录音内容'),(10,14,'更多录音内容')))
        self.assertEqual([c['targetIndex'] for c in fixed['cues']],[1,0])
        self.assertEqual([(c['start'],c['end']) for c in fixed['cues']],[(1,5),(10,14)])

    def test_cli_partial_repair_uses_manifest_and_keeps_uncertainty(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            text='今天我们一同来学习神的恩典，思想圣经的教导。愿主赐给我们智慧，让我们在生活中活出美好的见证。'
            page=root/'content/Example/chapter.md'
            page.parent.mkdir(parents=True)
            markdown='{{< audio src="missing.mp3" >}}\n\n'+text
            page.write_text(markdown,encoding='utf-8')
            (page.parent/'other.md').write_text('{{< audio src="other.mp3" >}}\n\n其他正文。',encoding='utf-8')
            output=root/'static/Example/chapter/audio-01.json'
            output.parent.mkdir(parents=True)
            output.write_text(json.dumps(self.old_payload(text,[(8,30)])),encoding='utf-8')
            supplied=root/'recording.json'
            supplied.write_text(json.dumps(word_transcript((1,20,text[:-12]))),encoding='utf-8')
            manifest=root/'manifest.json'
            manifest.write_text(json.dumps({'jobs':[dict(book='Example',page='chapter.md',
                audio='missing.mp3',transcript='recording.json')]}),encoding='utf-8')
            args=[sys.executable,str(Path(sync.__file__)),'--audio-root',str(root/'missing-audio'),
                '--all','--repair','--transcript-manifest',str(manifest),
                '--content-root',str(root/'content'),'--output-root',str(root/'static'),
                '--cache-root',str(root/'cache')]
            process=subprocess.run(args,capture_output=True,encoding='utf-8')
            self.assertEqual(process.returncode,2,process.stderr)
            repaired=json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual((repaired['cues'][0]['start'],repaired['cues'][0]['end']),(1,30))
            self.assertFalse(repaired['cues'][0]['quality']['endVerified'])
            self.assertEqual(page.read_text(encoding='utf-8'),markdown)
            report=json.loads((root/'cache/last-repair-report.json').read_text(encoding='utf-8'))
            self.assertEqual(report['jobCount'],1)
            self.assertEqual(report['jobs'][0]['status'],'repaired')
            before=output.read_bytes()
            repeat=subprocess.run(args,capture_output=True,encoding='utf-8')
            self.assertEqual(repeat.returncode,2,repeat.stderr)
            self.assertEqual(output.read_bytes(),before)
            self.assertNotIn('Loading Whisper',repeat.stdout)

    def test_extra_spoken_commentary_does_not_hide_supported_boundary(self):
        first='今天我们一同来学习神的恩典并思想圣经的教导'
        last='愿主赐给我们智慧帮助我们在生活中活出美好的见证'
        text=first+'。'+last+'。'
        extra='这是录音中临时加的一大段解释和历史背景说明不包含在网页正文之中。'*4
        recording=word_transcript((1,10,first),(11,40,extra),(41,50,last))
        cues,warnings=self.align(text,recording)
        self.assertLess(cues[0]['confidence'],.55)
        self.assertTrue(cues[0]['quality']['extraSpeechContext'])
        self.assertTrue(cues[0]['quality']['startVerified'])
        self.assertTrue(cues[0]['quality']['endVerified'])
        self.assertTrue(sync.alignment_requires_review(cues,warnings))
        old=self.old_payload(text,[(9,50)])
        fixed=sync.repair_existing_cues(sync.parse_text_units(text),old,recording)
        self.assertEqual(fixed['cues'][0]['start'],1)
        self.assertLess(fixed['cues'][0]['confidence'],.55)
        self.assertTrue(fixed['cues'][0]['quality']['reviewRequired'])

    def test_old_paragraph_is_not_silently_dropped_when_index_becomes_heading(self):
        old=self.old_payload('我们一同感谢神的恩典。',[(1,4)])
        with self.assertRaisesRegex(ValueError,'identity mismatch'):
            sync.repair_existing_cues(sync.parse_text_units('# 标题\n\n我们一同感谢神的恩典。'),old,
                transcript((1,4,'我们一同感谢神的恩典')))

    def test_heading_cannot_consume_intro_and_indices_stay_stable(self):
        text = "# 第一第二章\n\n亲爱的弟兄姊妹。今天我们读第一第二章。\n\n感谢神的恩典。"
        cues, warnings = self.align(text, transcript(
            (1.62, 3.86, "親愛的弟兄姊妹"),
            (5.46, 12.62, "今天我們讀第一第二章"),
            (14.96, 16.20, "感謝神的恩典")))
        self.assertFalse(warnings)
        self.assertEqual([c['targetIndex'] for c in cues], [1, 2])
        self.assertEqual(cues[0]['start'], 1.62)
        self.assertEqual(cues[0]['end'], 12.62)
        self.assertEqual(cues[1]['start'], 14.96)
        self.assertNotIn('heading', [c['kind'] for c in cues])

    def test_no_highlight_through_music_or_silence(self):
        cues, _ = self.align("第一段内容。\n\n第二段正文。", transcript(
            (1, 3, "第一段内容"), (30, 34, "第二段正文")))
        self.assertEqual(cues[0]['end'], 3)
        self.assertEqual(cues[1]['start'], 30)

    def test_unspoken_paragraph_does_not_shift_following_paragraph(self):
        cues, warnings = self.align("亲爱的弟兄姊妹。\n\n网页额外编辑的摘要。\n\n现在开始讨论正文。", transcript(
            (1, 4, "亲爱的弟兄姊妹"), (8, 12, "现在开始讨论正文")))
        self.assertEqual([c['targetIndex'] for c in cues], [0, 2])
        self.assertTrue(any('unmatched' in w and 'target 1:' in w for w in warnings))
        self.assertEqual(cues[-1]['start'], 8)

    def test_missing_prefix_flagged_even_when_overall_score_is_high(self):
        text = "亲爱的长辈弟兄姊妹主内平安。今天我们一起来分享这一章的内容。这个章节记录很多历史，也让我们看见神丰富的恩典与怜悯。"
        cues, warnings = self.align(text, transcript((10, 50, text[14:])))
        self.assertTrue(cues)
        self.assertGreater(cues[0]['confidence'], .7)
        self.assertTrue(cues[0]['quality']['reviewRequired'])
        self.assertTrue(any('incomplete start' in w for w in warnings))

    def test_missing_suffix_is_reported(self):
        cues, warnings = self.align("今天我们来看大卫的故事。神引导他前进，也赐他智慧。但愿我们也能信靠神。", transcript(
            (1, 12, "今天我们来看大卫的故事。神引导他前进，也赐他智慧。")))
        self.assertTrue(cues[0]['quality']['reviewRequired'])
        self.assertTrue(any('incomplete end' in w for w in warnings))

    def test_duplicate_paragraphs_use_distinct_occurrences(self):
        cues, _ = self.align("愿主赐福我们。\n\n愿主赐福我们。", transcript(
            (1, 3, "愿主赐福我们"), (8, 10, "愿主赐福我们")))
        self.assertEqual([c['start'] for c in cues], [1, 8])

    def test_unrelated_intro_is_not_assigned_to_body(self):
        cues, _ = self.align("今天我们来学习大卫的历史。", transcript(
            (1, 5, "这里是节目介绍请记得收听"),
            (12, 18, "今天我们来学习大卫的历史")))
        self.assertEqual(cues[0]['start'], 12)

    def test_traditional_conversion_does_not_change_browser_target(self):
        cues, _ = self.align("我們感謝神賜下恩典。", transcript((1, 4, "我们感谢神赐下恩典")))
        self.assertEqual(cues[0]['targetText'], sync.normalize_text("我們感謝神賜下恩典"))
        self.assertEqual(cues[0]['confidence'], 1)

    def test_audit_detects_wrong_start_despite_claimed_high_confidence(self):
        units = sync.parse_text_units("# 第二章\n\n亲爱的弟兄姊妹，今天我们读第二章。")
        recording = transcript((1.62, 3.86, "亲爱的弟兄姊妹"), (5, 10, "今天我们读第二章"))
        bad = {'cues': [dict(start=8, end=10, targetIndex=1,
                            targetText=units[1].normalized[:48], confidence=.95)]}
        warnings = sync.audit_existing_cues(units, bad, recording, .55)
        self.assertTrue(any('start differs from transcript' in w for w in warnings))

    def test_collapsed_hallucinated_words_do_not_anchor(self):
        recording = {'segments': [dict(start=0, end=1, text='正文', words=[
            dict(start=0, end=0, text='正文')]), dict(start=5, end=8, text='正文')]}
        cues, _ = self.align("正文", recording)
        self.assertEqual(cues[0]['start'], 5)

    def test_imitation_intro_isolated_number_cannot_anchor_body(self):
        # Real failure: intro has “一起来分享” at 7.11s, the body numeral
        # is transcribed as “以” at 33.52s, and “主说” starts at 34.52s.
        text = '一、主说，跟从我的，就不在黑暗里走。这是基督对我们的教训。'
        recording = word_transcript(
            (5.93, 7.11, '今天我们'), (7.11, 7.25, '一'), (7.25, 14.15, '起来分享托马斯所著的效法基督'),
            (19.27, 32.8, '第一卷培灵之道第一章效法基督与轻看世界的虚荣'),
            (33.52, 34, '以'), (34.52, 35.06, '主说'), (35.6, 38.56, '跟从我的就不在黑暗里走'),
            (41.88, 44.6, '这是基督对我们的教训'))
        cues, _ = self.align(text, recording)
        self.assertEqual(cues[0]['start'], 34.52)
        self.assertTrue(cues[0]['quality']['startVerified'])
        self.assertIn('discarded detached start matches', cues[0]['quality']['boundaryAdjusted'])
        good = {'cues': [dict(cues[0], start=33.52, confidence=.95)]}
        warnings = sync.audit_existing_cues(sync.parse_text_units(text), good, recording, .55)
        self.assertFalse(any('start differs' in w for w in warnings))

    def test_detached_single_character_in_signoff_cannot_extend_end(self):
        cues, _ = self.align('我们一同感谢主的恩典。', word_transcript(
            (1, 4, '我们一同感谢主的恩'),
            (30, 40, '谢谢收听这首诗歌再见弟兄姊妹祝福大家恩典')))
        self.assertLess(cues[0]['end'], 10)
        self.assertIn('discarded detached end matches', cues[0]['quality']['boundaryAdjusted'])

    def test_continuous_intro_phrase_still_needs_paragraph_context(self):
        text = '今天我们来读这本书。我们要一同学习神的恩典，愿祂赐给我们智慧，帮助我们明白圣经的教训，在生活中活出美好的见证。'
        recording = word_transcript((1,4,'今天我们来读这本书'),
            (5,20,'这是节目介绍作者的信息欢迎大家继续收听这套录音'),
            (30,34,'今朝大伙阅读这部书'), (35,60,text[10:]))
        cues, warnings = self.align(text, recording)
        self.assertFalse(cues[0]['quality']['startVerified'])
        self.assertTrue(cues[0]['quality']['startEvidence']['detachedContext'])
        self.assertTrue(any('detached boundary context' in w for w in warnings))

    def test_long_pause_alone_does_not_discard_real_first_words(self):
        cues, _ = self.align('我们今天一同来思想神的恩典。', word_transcript(
            (1, 3, '我们'), (30, 36, '今天一同来思想神的恩典')))
        self.assertEqual(cues[0]['start'], 1)

    def test_high_global_score_does_not_verify_weak_prefix(self):
        body = '甲乙丙丁戊己庚辛壬癸。我们一同来看这篇信息，学习怎样活出神的恩典。'
        cues, warnings = self.align(body, word_transcript(
            (1, 5, '甲错丙错戊错庚错壬错'), (6, 20, body[11:])))
        self.assertGreater(cues[0]['confidence'], .6)
        self.assertFalse(cues[0]['quality']['startVerified'])
        self.assertTrue(any('unverified start anchor' in w for w in warnings))

    def test_strong_prefix_alone_cannot_verify_low_coverage_paragraph(self):
        text = '今天我们一同来学习神的恩典，并思想圣经中的教导。愿主赐给我们智慧，帮助我们在生活中活出美好的见证，也让我们能以诚实的心服事身边的人。'
        cues, _ = self.align(text,word_transcript((1,20,text[:len(text)//2])))
        self.assertTrue(cues)
        self.assertTrue(cues[0]['quality']['startEvidence']['continuousAnchor'])
        self.assertFalse(cues[0]['quality']['startEvidence']['paragraphSupported'])
        self.assertFalse(cues[0]['quality']['startVerified'])

    def test_small_asr_boundary_substitution_is_supported_locally(self):
        cues, warnings = self.align('你们今天一同感谢神的恩典。', word_transcript(
            (1, 1.5, '妳们'), (1.5, 5, '今天一同感谢神的恩典')))
        self.assertEqual(cues[0]['start'], 1)
        self.assertTrue(cues[0]['quality']['startVerified'])
        self.assertIn('start substitution', cues[0]['quality']['boundaryAdjusted'])
        self.assertFalse(warnings)

    def test_boundary_inside_segment_without_words_is_not_precise(self):
        cues, warnings = self.align('我们一同感谢神的恩典。', transcript(
            (0, 30, '这里是节目介绍。我们一同感谢神的恩典。')))
        self.assertFalse(cues[0]['quality']['startVerified'])
        self.assertTrue(cues[0]['quality']['startEvidence']['insideSegment'])
        self.assertTrue(any('inside transcript segment' in w for w in warnings))

    def test_complete_segment_boundary_without_words_is_supported(self):
        cues, warnings = self.align('我们一同感谢神的恩典。', transcript((5, 9, '我们一同感谢神的恩典')))
        self.assertTrue(cues[0]['quality']['startVerified'])
        self.assertTrue(cues[0]['quality']['endVerified'])
        self.assertFalse(warnings)

    def test_audit_does_not_assert_wrong_time_from_unverified_reference(self):
        text = '亲爱的长辈弟兄姊妹主内平安。今天我们一起来分享这一章的内容，学习神丰富的恩典与怜悯。'
        recording = transcript((10, 40, text[14:]))
        units = sync.parse_text_units(text)
        old = {'cues': [dict(start=1, end=40, targetIndex=0,
                            targetText=units[0].normalized[:48], confidence=.99)]}
        warnings = sync.audit_existing_cues(units, old, recording, .55)
        self.assertTrue(any('unverified reference start' in w for w in warnings))
        self.assertFalse(any('start differs' in w for w in warnings))

    def test_audit_rejects_transcript_from_different_audio_duration(self):
        units = sync.parse_text_units('我们一同感谢神的恩典。')
        recording = dict(transcript((10, 20, units[0].text)), duration=100)
        old = {'audioDuration': 160, 'cues': [dict(start=1, end=20, targetIndex=0,
                targetText=units[0].normalized[:48], confidence=.99)]}
        warnings = sync.audit_existing_cues(units, old, recording, .55)
        self.assertTrue(any('duration mismatch' in w for w in warnings))
        self.assertFalse(any('start differs' in w for w in warnings))

    def test_audit_rejects_non_finite_timestamps(self):
        units = sync.parse_text_units('我们一同感谢神的恩典。')
        old = {'cues': [dict(start=float('nan'), end=20, targetIndex=0,
                targetText=units[0].normalized[:48], confidence=.99)]}
        warnings = sync.audit_existing_cues(units, old, transcript((10,20,units[0].text)), .55)
        self.assertTrue(any('non-finite' in w for w in warnings))

    def test_transcript_time_outside_audio_is_not_verified(self):
        recording = dict(word_transcript((10,20,'我们一同感谢神的恩典')),duration=15)
        cues, warnings = self.align('我们一同感谢神的恩典。',recording)
        self.assertFalse(cues[0]['quality']['endVerified'])
        self.assertTrue(any('exceeds audio duration' in w for w in warnings))

    def test_non_finite_transcript_words_do_not_anchor(self):
        recording = {'segments': [dict(start=0,end=4,text='正文',words=[
            dict(start=float('nan'),end=1,text='正文'),
            dict(start=1,end=float('inf'),text='正文')]),dict(start=5,end=8,text='正文')]}
        cues, _ = self.align('正文',recording)
        self.assertEqual(cues[0]['start'],5)

    def test_suffix_with_scattered_matches_is_not_verified(self):
        text = '我们今天一同来思想神的恩典。甲乙丙丁戊己庚辛壬癸。'
        cues, warnings = self.align(text, word_transcript(
            (1, 6, text[:-11]), (7, 15, '甲错丙错戊错庚错壬错')))
        self.assertFalse(cues[0]['quality']['endVerified'])
        self.assertTrue(any('unverified end anchor' in w for w in warnings))

    def test_cli_audit_is_read_only_and_reports_high_score_wrong_start(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            page = root / 'content' / 'Example' / 'chapter.md'
            page.parent.mkdir(parents=True)
            text = '# 第二章\n\n{{< audio src="01/recording.wav" >}}\n\n亲爱的弟兄姊妹，今天我们读第二章。'
            page.write_text(text, encoding='utf-8')
            units = sync.parse_text_units(text)
            output = root / 'static' / 'Example' / 'chapter' / 'audio-01.json'
            output.parent.mkdir(parents=True)
            payload = {'cues': [dict(start=8, end=10, kind='paragraph', targetIndex=1,
                                    targetText=units[1].normalized[:48], confidence=.95)]}
            output.write_text(json.dumps(payload), encoding='utf-8')
            transcript_path = root / 'transcripts' / '01' / 'recording.wav.json'
            transcript_path.parent.mkdir(parents=True)
            transcript_path.write_text(json.dumps(transcript(
                (1.62, 3.86, '亲爱的弟兄姊妹'), (5, 10, '今天我们读第二章'))), encoding='utf-8')
            before = output.read_bytes()
            args = [sys.executable, str(Path(sync.__file__)), '--audio-root', str(root),
                    '--book', 'Example', '--content-root', str(root / 'content'),
                    '--output-root', str(root / 'static'), '--cache-root', str(root / 'cache'),
                    '--transcript-root', str(root / 'transcripts'), '--audit']
            process = subprocess.run(args, capture_output=True, encoding='utf-8')
            self.assertEqual(process.returncode, 2, process.stderr)
            self.assertEqual(output.read_bytes(), before)
            self.assertEqual(page.read_text(encoding='utf-8'), text)
            report = json.loads((root / 'cache' / 'last-audit-report.json').read_text(encoding='utf-8'))
            self.assertTrue(any('start differs from transcript' in w for w in report['jobs'][0]['warnings']))

    def test_cached_results_keep_warnings_without_running_whisper(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            page = root / 'content' / 'Example' / 'chapter.md'
            page.parent.mkdir(parents=True)
            page.write_text('{{< audio src="missing.mp3" >}}\n\n正文。', encoding='utf-8')
            output = root / 'static' / 'Example' / 'chapter' / 'audio-01.json'
            output.parent.mkdir(parents=True)
            output.write_text(json.dumps({'alignmentMethod': sync.ALIGNMENT_METHOD,
                'alignmentWarnings': ['incomplete start: target 0'], 'cues': []}), encoding='utf-8')
            args = [sys.executable, str(Path(sync.__file__)), '--audio-root', str(root),
                    '--book', 'Example', '--content-root', str(root / 'content'),
                    '--output-root', str(root / 'static'), '--cache-root', str(root / 'cache')]
            process = subprocess.run(args, capture_output=True, encoding='utf-8')
            self.assertEqual(process.returncode, 0, process.stderr)
            report = json.loads((root / 'cache' / 'last-report.json').read_text(encoding='utf-8'))
            self.assertEqual(report['jobs'][0]['status'], 'cached')
            self.assertEqual(report['warningCount'], 1)

    def test_unverified_generation_preserves_existing_sync_and_markdown(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            page = root / 'content/Example/chapter.md'
            page.parent.mkdir(parents=True)
            text = '{{< audio src="recording.mp3" >}}\n\n亲爱的长辈弟兄姊妹主内平安。今天我们一起来分享这一章的内容，学习神丰富的恩典与怜悯。'
            page.write_text(text, encoding='utf-8')
            output = root / 'static/Example/chapter/audio-01.json'
            output.parent.mkdir(parents=True)
            output.write_text('{"existing":true}', encoding='utf-8')
            supplied = root / 'transcripts/recording.mp3.json'
            supplied.parent.mkdir(parents=True)
            body = sync.parse_text_units(text)[0].text
            supplied.write_text(json.dumps(transcript((10,40,body[14:]))), encoding='utf-8')
            args = [sys.executable, str(Path(sync.__file__)), '--audio-root', str(root),
                '--book', 'Example', '--content-root', str(root/'content'),
                '--output-root', str(root/'static'), '--cache-root', str(root/'cache'),
                '--transcript-root', str(root/'transcripts'), '--force', '--write']
            before = output.read_bytes()
            process = subprocess.run(args, capture_output=True, encoding='utf-8')
            self.assertEqual(process.returncode, 2, process.stderr)
            self.assertEqual(output.read_bytes(), before)
            self.assertEqual(page.read_text(encoding='utf-8'), text)
            report = json.loads((root/'cache/last-report.json').read_text(encoding='utf-8'))
            self.assertEqual(report['withheldJobCount'], 1)
            self.assertEqual(report['jobs'][0]['status'], 'needs_review')
            proposal = Path(report['jobs'][0]['proposal'])
            self.assertTrue(proposal.is_file())
            self.assertFalse(json.loads(proposal.read_text(encoding='utf-8'))['cues'][0]['quality']['startVerified'])
            reviewed = subprocess.run(args + ['--allow-unverified'], capture_output=True, encoding='utf-8')
            self.assertEqual(reviewed.returncode, 0, reviewed.stderr)
            self.assertNotEqual(output.read_bytes(), before)
            self.assertIn('sync=', page.read_text(encoding='utf-8'))

    def test_missing_paragraph_is_withheld_even_if_remaining_boundaries_verify(self):
        cues, warnings = self.align('网页额外编辑的摘要。\n\n我们一同感谢神的恩典。',
            transcript((1,4,'我们一同感谢神的恩典')))
        self.assertTrue(all(c['quality']['startVerified'] and c['quality']['endVerified'] for c in cues))
        self.assertTrue(sync.alignment_requires_review(cues,warnings))

    def test_manifest_selects_only_listed_jobs_without_reading_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            page = root/'content/Example/chapter.md'
            page.parent.mkdir(parents=True)
            page.write_text('{{< audio src="recording.mp3" >}}\n\n我们一同感谢神的恩典。',encoding='utf-8')
            (page.parent/'unlisted.md').write_text('{{< audio src="unlisted.mp3" >}}\n\n其他正文。',encoding='utf-8')
            supplied = root/'recording.json'
            supplied.write_text(json.dumps(transcript((1,4,'我们一同感谢神的恩典'))),encoding='utf-8-sig')
            manifest = root/'manifest.json'
            manifest.write_text(json.dumps({'jobs':[dict(book='Example',page='chapter.md',audio='recording.mp3',
                transcript='recording.json')]}),encoding='utf-8')
            args = [sys.executable,str(Path(sync.__file__)),'--audio-root',str(root/'nonexistent-audio'),
                '--all','--force','--transcript-manifest',str(manifest),'--content-root',str(root/'content'),
                '--output-root',str(root/'static'),'--cache-root',str(root/'cache')]
            process = subprocess.run(args,capture_output=True,encoding='utf-8')
            self.assertEqual(process.returncode,0,process.stderr)
            self.assertTrue((root/'static/Example/chapter/audio-01.json').exists())
            self.assertFalse((root/'static/Example/unlisted/audio-01.json').exists())
            report = json.loads((root/'cache/last-report.json').read_text(encoding='utf-8'))
            self.assertEqual(report['jobCount'],1)
            self.assertEqual(report['jobs'][0]['status'],'generated')
            supplied.unlink()
            failed = subprocess.run(args,capture_output=True,encoding='utf-8')
            self.assertEqual(failed.returncode,1)
            self.assertNotIn('Loading Whisper',failed.stdout)

    def test_manifest_rejects_duplicate_job(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'manifest.json'
            job = dict(book='Example',page='chapter.md',audio='recording.mp3',transcript='recording.json')
            path.write_text(json.dumps({'jobs':[job,job]}),encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'duplicate'):
                sync.read_transcript_manifest(path)


if __name__ == '__main__':
    unittest.main()
