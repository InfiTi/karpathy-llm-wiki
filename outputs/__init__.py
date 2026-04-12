"""outputs: 知识库输出模块

生成知识图谱可视化、统计报告等输出内容。
"""
from pathlib import Path
import json


def generate_knowledge_graph_html(graph_path, output_path):
    """
    生成知识图谱 HTML 可视化页面
    
    Args:
        graph_path: knowledge_graph.json 文件路径
        output_path: 输出 HTML 文件路径
    """
    graph_path = Path(graph_path)
    output_path = Path(output_path)
    
    if not graph_path.exists():
        print(f"[ERROR] 知识图谱文件不存在: {graph_path}")
        return None
    
    with open(graph_path, 'r', encoding='utf-8') as f:
        graph = json.load(f)
    
    html_content = _generate_graph_html(graph)
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"[OUTPUT] 知识图谱可视化已生成: {output_path}")
    return str(output_path)


def _generate_graph_html(graph):
    """生成知识图谱 HTML 内容"""
    nodes_json = json.dumps(graph.get('nodes', []), ensure_ascii=False, indent=2)
    edges_json = json.dumps(graph.get('edges', []), ensure_ascii=False, indent=2)
    
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>知识图谱可视化</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #fff;
        }}
        .container {{
            display: flex;
            flex-direction: column;
            height: 100vh;
        }}
        .header {{
            padding: 20px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }}
        .header h1 {{
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 10px;
        }}
        .stats {{
            display: flex;
            gap: 20px;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
        }}
        .stat {{
            display: flex;
            align-items: center;
            gap: 5px;
        }}
        .stat-value {{
            font-weight: 600;
            color: #4fc3f7;
        }}
        .graph-container {{
            flex: 1;
            position: relative;
            overflow: hidden;
        }}
        #graph {{
            width: 100%;
            height: 100%;
        }}
        .node {{
            cursor: pointer;
        }}
        .node circle {{
            stroke: #fff;
            stroke-width: 2px;
            transition: all 0.3s ease;
        }}
        .node:hover circle {{
            stroke-width: 4px;
            filter: drop-shadow(0 0 10px rgba(79, 195, 247, 0.5));
        }}
        .node text {{
            font-size: 12px;
            fill: #fff;
            pointer-events: none;
        }}
        .link {{
            stroke: rgba(255, 255, 255, 0.2);
            stroke-opacity: 0.6;
        }}
        .link.references {{
            stroke: #4fc3f7;
        }}
        .link.same_tag {{
            stroke: #81c784;
            stroke-dasharray: 5, 5;
        }}
        .tooltip {{
            position: absolute;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 12px;
            max-width: 300px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            z-index: 100;
        }}
        .tooltip.visible {{
            opacity: 1;
        }}
        .tooltip-title {{
            font-weight: 600;
            margin-bottom: 8px;
            color: #4fc3f7;
        }}
        .tooltip-meta {{
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 8px;
        }}
        .tooltip-summary {{
            font-size: 13px;
            line-height: 1.5;
        }}
        .legend {{
            position: absolute;
            bottom: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.5);
            padding: 15px;
            border-radius: 8px;
        }}
        .legend-title {{
            font-weight: 600;
            margin-bottom: 10px;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 5px;
            font-size: 12px;
        }}
        .legend-line {{
            width: 20px;
            height: 2px;
        }}
        .legend-line.references {{
            background: #4fc3f7;
        }}
        .legend-line.same_tag {{
            background: #81c784;
            background: repeating-linear-gradient(
                90deg,
                #81c784,
                #81c784 5px,
                transparent 5px,
                transparent 10px
            );
        }}
        .controls {{
            position: absolute;
            top: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }}
        .control-btn {{
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
        }}
        .control-btn:hover {{
            background: rgba(255, 255, 255, 0.2);
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🕸️ 知识图谱可视化</h1>
            <div class="stats">
                <div class="stat">
                    <span>节点数量:</span>
                    <span class="stat-value" id="node-count">0</span>
                </div>
                <div class="stat">
                    <span>关联数量:</span>
                    <span class="stat-value" id="edge-count">0</span>
                </div>
            </div>
        </div>
        <div class="graph-container">
            <svg id="graph"></svg>
            <div class="tooltip" id="tooltip"></div>
            <div class="legend">
                <div class="legend-title">图例</div>
                <div class="legend-item">
                    <div class="legend-line references"></div>
                    <span>引用关系</span>
                </div>
                <div class="legend-item">
                    <div class="legend-line same_tag"></div>
                    <span>标签关联</span>
                </div>
            </div>
            <div class="controls">
                <button class="control-btn" onclick="resetZoom()">重置视图</button>
                <button class="control-btn" onclick="toggleLabels()">切换标签</button>
            </div>
        </div>
    </div>
    
    <script>
        const nodes = {nodes_json};
        const edges = {edges_json};
        
        document.getElementById('node-count').textContent = nodes.length;
        document.getElementById('edge-count').textContent = edges.length;
        
        const width = window.innerWidth;
        const height = window.innerHeight - 100;
        
        const svg = d3.select('#graph')
            .attr('width', width)
            .attr('height', height);
        
        const g = svg.append('g');
        
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {{
                g.attr('transform', event.transform);
            }});
        
        svg.call(zoom);
        
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(edges).id(d => d.id).distance(150))
            .force('charge', d3.forceManyBody().strength(-500))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(40));
        
        const link = g.append('g')
            .selectAll('line')
            .data(edges)
            .enter()
            .append('line')
            .attr('class', d => `link ${{d.type}}`)
            .attr('stroke-width', 1.5);
        
        const node = g.append('g')
            .selectAll('g')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'node')
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));
        
        const colorScale = d3.scaleOrdinal()
            .domain(['concept', 'paper', 'person', 'tool', 'dataset', 'note'])
            .range(['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#90a4ae']);
        
        node.append('circle')
            .attr('r', 20)
            .attr('fill', d => colorScale(d.type));
        
        node.append('text')
            .attr('dy', 35)
            .attr('text-anchor', 'middle')
            .text(d => d.title.length > 10 ? d.title.substring(0, 10) + '...' : d.title);
        
        node.on('mouseover', showTooltip)
            .on('mouseout', hideTooltip)
            .on('click', (event, d) => {{
                const wikiPath = d.file;
                if (wikiPath) {{
                    console.log('Opening wiki:', wikiPath);
                }}
            }});
        
        simulation.on('tick', () => {{
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            
            node.attr('transform', d => `translate(${{d.x}},${{d.y}})`);
        }});
        
        function dragstarted(event, d) {{
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }}
        
        function dragged(event, d) {{
            d.fx = event.x;
            d.fy = event.y;
        }}
        
        function dragended(event, d) {{
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }}
        
        const tooltip = document.getElementById('tooltip');
        
        function showTooltip(event, d) {{
            tooltip.innerHTML = `
                <div class="tooltip-title">${{d.title}}</div>
                <div class="tooltip-meta">
                    类型: ${{d.type}} | 标签: ${{d.tags ? d.tags.join(', ') : '无'}}
                </div>
                <div class="tooltip-summary">${{d.summary || '暂无摘要'}}</div>
            `;
            tooltip.style.left = event.pageX + 15 + 'px';
            tooltip.style.top = event.pageY + 15 + 'px';
            tooltip.classList.add('visible');
        }}
        
        function hideTooltip() {{
            tooltip.classList.remove('visible');
        }}
        
        function resetZoom() {{
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
        }}
        
        let showLabels = true;
        function toggleLabels() {{
            showLabels = !showLabels;
            node.select('text').style('opacity', showLabels ? 1 : 0);
        }}
    </script>
</body>
</html>'''


def generate_stats_report(wiki_dir, output_path):
    """
    生成知识库统计报告
    
    Args:
        wiki_dir: wiki 目录路径
        output_path: 输出报告路径
    """
    wiki_dir = Path(wiki_dir)
    output_path = Path(output_path)
    
    if not wiki_dir.exists():
        print(f"[ERROR] wiki 目录不存在: {wiki_dir}")
        return None
    
    stats = _collect_stats(wiki_dir)
    report = _generate_report_markdown(stats)
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"[OUTPUT] 统计报告已生成: {output_path}")
    return str(output_path)


def _collect_stats(wiki_dir):
    """收集知识库统计信息"""
    from lint import _parse
    
    stats = {
        'total_pages': 0,
        'total_links': 0,
        'total_tags': 0,
        'tag_distribution': {},
        'type_distribution': {},
        'link_density': 0,
        'pages': []
    }
    
    for md_file in wiki_dir.glob("*.md"):
        if md_file.name in ["index.md", "knowledge_graph.json"]:
            continue
        
        try:
            content = md_file.read_text(encoding="utf-8", errors="ignore")
            parsed = _parse(content)
            
            if not parsed.get("title"):
                continue
            
            stats['total_pages'] += 1
            stats['total_links'] += len(parsed.get("links", []))
            
            for tag in parsed.get("tags", []):
                stats['tag_distribution'][tag] = stats['tag_distribution'].get(tag, 0) + 1
                stats['total_tags'] += 1
            
            page_type = parsed.get("type", "note")
            stats['type_distribution'][page_type] = stats['type_distribution'].get(page_type, 0) + 1
            
            stats['pages'].append({
                'title': parsed.get("title", md_file.stem),
                'type': page_type,
                'tags': parsed.get("tags", []),
                'links': len(parsed.get("links", [])),
                'content_length': len(parsed.get("body", ""))
            })
        except Exception as e:
            print(f"[WARNING] 解析文件 {md_file} 时出错: {e}")
    
    if stats['total_pages'] > 0:
        stats['link_density'] = stats['total_links'] / stats['total_pages']
    
    return stats


def _generate_report_markdown(stats):
    """生成 Markdown 格式的统计报告"""
    import datetime
    
    report = f'''# 知识库统计报告

生成时间：{datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

---

## 概览

| 指标 | 数值 |
|------|------|
| 总页面数 | {stats['total_pages']} |
| 总链接数 | {stats['total_links']} |
| 总标签数 | {stats['total_tags']} |
| 平均链接密度 | {stats['link_density']:.2f} |

---

## 页面类型分布

| 类型 | 数量 |
|------|------|
'''
    
    for ptype, count in sorted(stats['type_distribution'].items(), key=lambda x: -x[1]):
        report += f"| {ptype} | {count} |\n"
    
    report += '''
---

## 标签分布（Top 10）

| 标签 | 数量 |
|------|------|
'''
    
    for tag, count in sorted(stats['tag_distribution'].items(), key=lambda x: -x[1])[:10]:
        report += f"| {tag} | {count} |\n"
    
    report += '''
---

## 页面列表

| 标题 | 类型 | 链接数 | 内容长度 |
|------|------|--------|----------|
'''
    
    for page in stats['pages']:
        report += f"| {page['title']} | {page['type']} | {page['links']} | {page['content_length']} |\n"
    
    return report


def generate_tag_cloud_html(wiki_dir, output_path):
    """
    生成标签云 HTML 可视化页面
    
    Args:
        wiki_dir: wiki 目录路径
        output_path: 输出 HTML 文件路径
    """
    wiki_dir = Path(wiki_dir)
    output_path = Path(output_path)
    
    if not wiki_dir.exists():
        print(f"[ERROR] wiki 目录不存在: {wiki_dir}")
        return None
    
    stats = _collect_stats(wiki_dir)
    tags = stats['tag_distribution']
    
    html_content = _generate_tag_cloud_html(tags)
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"[OUTPUT] 标签云已生成: {output_path}")
    return str(output_path)


def _generate_tag_cloud_html(tags):
    """生成标签云 HTML 内容"""
    import json
    
    tags_json = json.dumps(
        [{"tag": tag, "count": count} for tag, count in sorted(tags.items(), key=lambda x: -x[1])],
        ensure_ascii=False
    )
    
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>标签云</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #fff;
            padding: 40px;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
        }}
        .header {{
            text-align: center;
            margin-bottom: 40px;
        }}
        .header h1 {{
            font-size: 32px;
            font-weight: 600;
            margin-bottom: 10px;
        }}
        .header p {{
            color: rgba(255, 255, 255, 0.7);
        }}
        .tag-cloud {{
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 15px;
            padding: 20px;
        }}
        .tag {{
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 25px;
            cursor: pointer;
            transition: all 0.3s ease;
        }}
        .tag:hover {{
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }}
        .tag-name {{
            font-weight: 500;
        }}
        .tag-count {{
            background: rgba(79, 195, 247, 0.3);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 12px;
            color: #4fc3f7;
        }}
        .stats {{
            display: flex;
            justify-content: center;
            gap: 40px;
            margin-top: 40px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
        }}
        .stat {{
            text-align: center;
        }}
        .stat-value {{
            font-size: 28px;
            font-weight: 600;
            color: #4fc3f7;
        }}
        .stat-label {{
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            margin-top: 5px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏷️ 标签云</h1>
            <p>知识库标签分布可视化</p>
        </div>
        <div class="tag-cloud" id="tag-cloud"></div>
        <div class="stats">
            <div class="stat">
                <div class="stat-value" id="total-tags">0</div>
                <div class="stat-label">标签总数</div>
            </div>
            <div class="stat">
                <div class="stat-value" id="unique-tags">0</div>
                <div class="stat-label">独立标签</div>
            </div>
        </div>
    </div>
    
    <script>
        const tags = {tags_json};
        
        const totalTags = tags.reduce((sum, t) => sum + t.count, 0);
        document.getElementById('total-tags').textContent = totalTags;
        document.getElementById('unique-tags').textContent = tags.length;
        
        const maxCount = Math.max(...tags.map(t => t.count));
        const minCount = Math.min(...tags.map(t => t.count));
        
        const tagCloud = document.getElementById('tag-cloud');
        
        tags.forEach(tagData => {{
            const tag = document.createElement('div');
            tag.className = 'tag';
            
            const size = minCount === maxCount ? 16 : 12 + (tagData.count - minCount) / (maxCount - minCount) * 12;
            tag.style.fontSize = size + 'px';
            
            const hue = (tagData.count / maxCount) * 200 + 180;
            tag.style.borderColor = `hsla(${{hue}}, 70%, 60%, 0.5)`;
            
            tag.innerHTML = `
                <span class="tag-name">${{tagData.tag}}</span>
                <span class="tag-count">${{tagData.count}}</span>
            `;
            
            tag.onclick = () => {{
                console.log('Clicked tag:', tagData.tag);
            }};
            
            tagCloud.appendChild(tag);
        }});
    </script>
</body>
</html>'''
